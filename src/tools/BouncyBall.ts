import { RESTITUTION } from '../core/constants';
import type { SerializedItem } from '../core/types';
import { SoundEmitter, appendToneControls } from './Bell';
import { clamp } from '../core/math';
import { state } from '../state';
import {
    createContextMenu,
    menuBody,
    rangeControl,
    rowLabel,
} from '../ui/menu';

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

const DEFAULT_BOUNCE_FACTOR = 0.8;
const DEFAULT_FRICTION_FACTOR = 0.8;

const MAX_THROW_SPEED = 6400;
const THROW_SAMPLE_WINDOW = 120;
const THROW_MIN_SAMPLE_TIME = 40;

const MIN_BOUNCE_SPEED = 30;
const MIN_FRICTION_SPEED = 6;

const THROW_MOVE_THRESHOLD = 0.05;

interface DragSample {
    x: number;
    y: number;
    t: number;
}

interface LandingResult {
    landed: boolean;
    landingY: number;
}

export class BouncyBall extends SoundEmitter {

    static label = '篮球';

    static icon = '<i class="fa-solid fa-basketball"></i>';

    static size: readonly [number, number] = [2, 2];

    static shape = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bouncy-ball-orb" cx="30%" cy="25%" r="78%">
      <stop offset="0" stop-color="#fff1cf" />
      <stop offset=".28" stop-color="#f6a34a" />
      <stop offset=".72" stop-color="#d86a24" />
      <stop offset="1" stop-color="#8a3214" />
    </radialGradient>

    <linearGradient id="bouncy-ball-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe7ad" />
      <stop offset=".45" stop-color="#e78235" />
      <stop offset="1" stop-color="#7f2a10" />
    </linearGradient>
  </defs>

  <circle class="hit-hint" cx="24" cy="24" r="21" />

  <circle
    cx="24"
    cy="24"
    r="19"
    fill="url(#bouncy-ball-orb)"
    stroke="url(#bouncy-ball-rim)"
    stroke-width="1.5"
  />

  <path
    d="
      M24 5
      C30 11 32 18 31 24
      C30 31 25 37 18 42
    "
    fill="none"
    stroke="#6d2915"
    stroke-width="2"
    opacity=".75"
  />

  <path
    d="
      M7 18
      C14 19 20 17 24 13
      C27 10 30 7 33 6
    "
    fill="none"
    stroke="#6d2915"
    stroke-width="2"
    opacity=".72"
  />

  <path
    d="
      M11 36
      C18 33 26 34 34 38
    "
    fill="none"
    stroke="#6d2915"
    stroke-width="2"
    opacity=".7"
  />

  <circle cx="16" cy="13" r="5" fill="#fff7df" opacity=".28" />
  <circle cx="19" cy="16" r="2" fill="#fffbe9" opacity=".32" />
</svg>`;

    bounceFactor = DEFAULT_BOUNCE_FACTOR;
    frictionFactor = DEFAULT_FRICTION_FACTOR;
    private dragSamples: DragSample[] = [];
    private wasDragging = false;

    update(dt: number): void {
        BouncyBall.onMove(this, dt);
        if (this.dragging) { this.updateDragging() }
        else { this.updatePhysics(dt) }
        this.render();
    }
    private updateDragging(): void {
        if (!this.wasDragging) {
            this.vx = 0;
            this.vy = 0;
            this.wasDragging = true;
            this.dragSamples.length = 0;
        }
        const now = performance.now();
        const last = this.getLastDragSample();
        if (last && !this.hasMovedSince(last)) { return; }
        this.dragSamples.push({ x: this.px, y: this.py, t: now });
        const minTime = now - THROW_SAMPLE_WINDOW;
        while (this.dragSamples.length > 2 && this.dragSamples[0].t < minTime) { this.dragSamples.shift() }
        this.grounded = false;
    }

    /**
     * 非拖拽状态下更新物理。
     */
    private updatePhysics(dt: number): void {
        if (this.wasDragging) {
            this.applyThrowVelocity();
            this.wasDragging = false;
            this.dragSamples.length = 0;
            this.grounded = false;
        }
        this.applyGravity(dt);
        const collision = this.findLanding(dt);
        if (collision.landed) { this.resolveLanding(dt, collision.landingY) }
        else { this.py += this.vy * dt }
        this.px += this.vx * dt;
        this.resolveHorizontalBounds();
    }

    /**
     * 结束拖拽并把拖拽轨迹转换成初速度。
     */


    // -----------------------------------------------------------------------
    // 拖拽 / 甩出速度
    // -----------------------------------------------------------------------

    /**
     * 当前球的位置是否已经移动到值得记录的程度。
     */
    private hasMovedSince(sample: DragSample): boolean {
        return (
            Math.abs(sample.x - this.px) > THROW_MOVE_THRESHOLD ||
            Math.abs(sample.y - this.py) > THROW_MOVE_THRESHOLD
        );
    }

    private getLastDragSample(): DragSample | undefined {
        return this.dragSamples[this.dragSamples.length - 1];
    }

    /**
     * 根据最近一段拖拽轨迹计算甩出速度。
     */
    private applyThrowVelocity(): void {
        const now = performance.now();

        // 如果最后一帧的位置还没被采样，先补一个。
        let last = this.getLastDragSample();

        if (!last || this.hasMovedSince(last)) {
            this.dragSamples.push({
                x: this.px,
                y: this.py,
                t: now,
            });

            last = this.getLastDragSample();
        }

        if (!last || this.dragSamples.length < 2) {
            this.stopHorizontalMotion();
            this.stopVerticalMotion();
            return;
        }

        const first = this.findThrowStartSample(last.t);

        const elapsed = last.t - first.t;

        if (elapsed <= 0.5) {
            this.stopHorizontalMotion();
            this.stopVerticalMotion();
            return;
        }

        const seconds = elapsed / 1000;

        let vx = (last.x - first.x) / seconds;
        let vy = (last.y - first.y) / seconds;

        [vx, vy] = this.limitVelocity(vx, vy);

        this.vx = vx;
        this.vy = vy;
    }

    /**
     * 找到至少约 THROW_MIN_SAMPLE_TIME 毫秒以前的采样点。
     *
     * 这样不会只根据松手前两个极近的点计算速度。
     */
    private findThrowStartSample(lastTime: number): DragSample {
        let first = this.dragSamples[0];

        for (const sample of this.dragSamples) {
            if (lastTime - sample.t >= THROW_MIN_SAMPLE_TIME) {
                first = sample;
            } else {
                break;
            }
        }

        return first;
    }

    /**
     * 限制甩出速度。
     */
    private limitVelocity(
        vx: number,
        vy: number,
    ): [number, number] {

        const speedSq = vx * vx + vy * vy;
        const maxSpeedSq = MAX_THROW_SPEED * MAX_THROW_SPEED;

        if (speedSq <= maxSpeedSq) {
            return [vx, vy];
        }

        const scale = MAX_THROW_SPEED / Math.sqrt(speedSq);

        return [
            vx * scale,
            vy * scale,
        ];
    }
    private resolveLanding(dt: number, landingY: number): void {
        this.py = landingY;

        if (this.grounded) {
            this.applyFriction(dt);
        } else {
            this.applyBounce();
        }

        if (Math.abs(this.vx) < MIN_FRICTION_SPEED) {
            this.vx = 0;
        }
    }

    /**
     * 处理反弹。
     */
    private applyBounce(): void {
        const impactVelocity = this.vy;

        if (impactVelocity <= 0) {
            this.landWithoutBounce();
            return;
        }

        const bounceVelocity =
            -impactVelocity * this.bounceFactor;

        if (Math.abs(bounceVelocity) < MIN_BOUNCE_SPEED) {
            this.landWithoutBounce();
        } else {
            this.vy = bounceVelocity;
        }

        // 每次真正撞击地面 / 平台时发声。
        if (this.mode === 'click') {
            this.emitOnce();
        }

        // 水平碰撞损耗。
        this.vx *= this.frictionFactor;
    }

    /**
     * 速度已经不足以继续反弹，进入静止/滚动状态。
     */
    private landWithoutBounce(): void {
        this.vy = 0;
        this.grounded = true;
    }

    /**
     * 已经在地面上时使用滑动摩擦。
     */
    private applyFriction(dt: number): void {
        const friction = FRICTION_ACCELERATION * dt;
        if (this.vx > friction) { this.vx -= friction; }
        else if (this.vx < -friction) { this.vx += friction; }
        else { this.vx = 0; }
    }

    // -----------------------------------------------------------------------
    // 水平边界
    // -----------------------------------------------------------------------

    private resolveHorizontalBounds(): void {
        const maxX = Math.max(0, state.deskW - this.w);

        if (this.px < 0) {
            this.px = 0;
            this.vx *= -RESTITUTION;
            return;
        }

        if (this.px > maxX) {
            this.px = maxX;
            this.vx *= -RESTITUTION;
        }
    }

    // -----------------------------------------------------------------------
    // 速度辅助
    // -----------------------------------------------------------------------

    private stopHorizontalMotion(): void {
        this.vx = 0;
    }

    private stopVerticalMotion(): void {
        this.vy = 0;
    }

    // -----------------------------------------------------------------------
    // 视觉
    // -----------------------------------------------------------------------

    static onMove(raw: BouncyBall, dt: number): void {
        super.onMove(raw, dt);

        const svg = raw.el.firstElementChild as SVGSVGElement | null;

        if (!svg) {
            return;
        }

        const glow = raw.vib;

        if (glow <= 0.05) {
            svg.style.filter = '';
            return;
        }

        const brightness = (1 + glow * 0.35).toFixed(2);
        const blur = (3 + glow * 8).toFixed(1);
        const alpha = (0.20 + glow * 0.55).toFixed(2);

        svg.style.filter =
            `brightness(${brightness}) ` +
            `drop-shadow(0 0 ${blur}px rgba(255,190,90,${alpha}))`;
    }

    static onClick(_raw: BouncyBall): void {
        // 篮球本身没有额外的 click 行为。
    }

    static onRelease(raw: BouncyBall): void {
        raw.render();
    }

    // -----------------------------------------------------------------------
    // 设置菜单
    // -----------------------------------------------------------------------

    static onContextMenu(item: BouncyBall): HTMLElement {
        const root = createContextMenu(item, BouncyBall.label);
        const body = menuBody(root);

        appendToneControls(body, item);

        body.appendChild(rowLabel('弹跳损耗'));

        body.appendChild(
            rangeControl(
                0,
                1,
                0.01,
                item.bounceFactor,
                (value) => `垂直速度 × ${value}`,
                (value) => {
                    item.bounceFactor = value;
                },
            ),
        );

        body.appendChild(rowLabel('摩擦损耗'));

        body.appendChild(
            rangeControl(
                0,
                1,
                0.01,
                item.frictionFactor,
                (value) => `水平速度 × ${value}`,
                (value) => {
                    item.frictionFactor = value;
                },
            ),
        );

        const note = document.createElement('div');

        note.className = 'menu-note';
        note.textContent = '篮球可以在地上弹跳。';

        body.appendChild(note);

        return root;
    }

    // -----------------------------------------------------------------------
    // 序列化
    // -----------------------------------------------------------------------

    serialize(): SerializedItem {
        return {
            ...super.serialize(),

            freq: this.freq,
            mode: this.mode,

            bounceFactor: this.bounceFactor,
            frictionFactor: this.frictionFactor,
        };
    }

    deserialize(data: SerializedItem): void {
        super.deserialize(data);

        const extra = data as SerializedItem & {
            bounceFactor?: number;
            frictionFactor?: number;
        };

        if (typeof extra.bounceFactor === 'number') {
            this.bounceFactor = clamp(
                extra.bounceFactor,
                0,
                1,
            );
        }

        if (typeof extra.frictionFactor === 'number') {
            this.frictionFactor = clamp(
                extra.frictionFactor,
                0,
                1,
            );
        }

        this.resetPhysicsState();
        this.render();
    }

    private resetPhysicsState(): void {
        this.dragSamples.length = 0;
        this.wasDragging = false;

        this.vx = 0;
        this.vy = 0;

        this.grounded = false;
    }
}