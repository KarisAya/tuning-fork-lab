
import { RESTITUTION, GRAVITY } from '../core/constants';
import type { SerializedItem } from '../core/types';
import { SoundEmitter, appendToneControls } from './Bell';
import { Tool } from './Tool';
import { clamp } from '../core/math';
import { state } from '../state';
import {
    createContextMenu,
    menuBody,
    rangeControl,
    rowLabel,
} from '../ui/menu';

const DEFAULT_BOUNCE_FACTOR = 0.8;
const DEFAULT_FRICTION_FACTOR = 0.8;
const MAX_THROW_SPEED = 6400;
const THROW_SAMPLE_WINDOW = 120;
const MIN_BOUNCE_SPEED = 30;
const MIN_FRICTION_SPEED = 6;
const THROW_X_THERHOLD = 0.05;
const MIU_ACC = 0.06 * GRAVITY // 摩擦系数 * 重力加速度 = 摩擦加速度

interface DragSample {
    x: number;
    y: number;
    t: number;
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
  <circle cx="24" cy="24" r="19" fill="url(#bouncy-ball-orb)" stroke="url(#bouncy-ball-rim)" stroke-width="1.5" />
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
    private isMove(last: DragSample) {
        return Math.abs(last.x - this.px) > THROW_X_THERHOLD || Math.abs(last.y - this.py) > THROW_X_THERHOLD
    }
    private recordDragSample(): void {
        const now = performance.now(); // 不使用 dt 作为采样时间，用户松手的瞬间可能发生在两个动画帧之间，使用真实时间更适合计算“甩出速度”
        const last = this.dragSamples[this.dragSamples.length - 1];
        if (last && !this.isMove(last)) { return; }
        this.dragSamples.push({ x: this.px, y: this.py, t: now });
        const minTime = now - THROW_SAMPLE_WINDOW;
        while (this.dragSamples.length > 2 && this.dragSamples[0].t < minTime) { this.dragSamples.shift(); }
    }

    private applyThrowVelocity(): void {
        const now = performance.now();
        const last = this.dragSamples[this.dragSamples.length - 1];
        if (!last || this.isMove(last)) { this.dragSamples.push({ x: this.px, y: this.py, t: now }); }
        if (this.dragSamples.length < 2) { this.vx = 0; this.vy = 0; return; }
        let firstSample = this.dragSamples[0];
        for (const sample of this.dragSamples) { if (last.t - sample.t >= 40) { firstSample = sample; } }
        const elapsed = last.t - firstSample.t;
        if (elapsed <= 0.5) { this.vx = 0; this.vy = 0; return; }
        let vx = (last.x - firstSample.x) / (elapsed / 1000);
        let vy = (last.y - firstSample.y) / (elapsed / 1000);
        const speedSq = vx * vx + vy * vy;
        if (speedSq > MAX_THROW_SPEED * MAX_THROW_SPEED) {
            const speed = Math.sqrt(speedSq);
            const scale = MAX_THROW_SPEED / speed;
            vx *= scale;
            vy *= scale;
        }
        this.vx = vx;
        this.vy = vy;
    }
    private stepBallPhysics(dt: number) {
        this.vy += GRAVITY * dt;
        const oldPy = this.py;
        const oldBottom = oldPy + this.h;
        const newPy = this.py + this.vy * dt;
        const newBottom = newPy + this.h;
        let landed = false;
        let landingY = 0;
        if (newBottom >= state.deskH) { landingY = state.deskH - this.h; landed = true; }
        else {
            for (const platform of state.items) {
                if (platform === this || platform.removed || !(platform.constructor as typeof Tool).isPlatform) { continue; }
                if (this.px + this.w <= platform.px + 1 || this.px >= platform.px + platform.w - 1) { continue; }
                if (this.vy > 0 && oldBottom <= platform.py + 0.5 && newBottom >= platform.py) {
                    landingY = platform.py - this.h;
                    landed = true;
                    break;
                }
            }
        }
        if (landed) {
            if (this.grounded) {
                // 落地不跳，变成滚动
                const dx = MIU_ACC * dt
                if (this.vx > 0) {
                    if (this.vx > dx) { this.vx -= dx }
                    else { this.vx = 0 }
                } else {
                    if (this.vx < -dx) { this.vx += dx }
                    else { this.vx = 0 }
                }
            }
            else {
                const impactVy = this.vy;
                if (impactVy > 0) {
                    const bounceVy = -impactVy * this.bounceFactor;
                    if (Math.abs(bounceVy) < MIN_BOUNCE_SPEED) { this.vy = 0; this.grounded = true; }
                    else { this.vy = bounceVy; }
                    if (this.mode === 'click') { this.emitOnce(); }
                } else { this.vy = 0; this.grounded = true; }
                this.vx *= this.frictionFactor;
            }
            if (Math.abs(this.vx) < MIN_FRICTION_SPEED) { this.vx = 0; }
            this.py = landingY;
        } else { this.py = newPy; }
        this.px += this.vx * dt;
        if (this.px < 0) { this.px = 0; this.vx *= -RESTITUTION; }
        if (this.px > state.deskW) { this.px = state.deskW; this.vx *= -RESTITUTION; }
        return landed;
    }

    update(dt: number): void {
        BouncyBall.onMove(this, dt);
        if (this.dragging) {
            if (!this.wasDragging) {
                this.wasDragging = true;
                this.dragSamples.length = 0;
                this.vx = 0;
                this.vy = 0;
            }
            this.recordDragSample();
            this.grounded = false;
            this.render();
            return;
        } else {
            if (this.wasDragging) {
                this.applyThrowVelocity();
                this.wasDragging = false;
                this.dragSamples.length = 0;
                this.grounded = false;
            }
            this.stepBallPhysics(dt);
        }
        this.render();
    }

    static onMove(raw: BouncyBall, dt: number,): void {
        super.onMove(raw, dt);
        // -------------------------------------------------------------------------
        // 视觉反馈
        // -------------------------------------------------------------------------
        const svg = raw.el.firstElementChild as SVGSVGElement | null;
        if (!svg) return;
        const glow = raw.vib;
        svg.style.filter =
            glow > 0.05
                ? `brightness(${(1 + glow * 0.35).toFixed(2)}) ` +
                `drop-shadow(` +
                `0 0 ${(3 + glow * 8).toFixed(1)}px ` +
                `rgba(255,190,90,${(0.20 + glow * 0.55).toFixed(2)})` +
                `)`
                : '';
    }
    static onClick(_raw: BouncyBall): void { }

    static onRelease(raw: BouncyBall): void { raw.render(); }

    static onContextMenu(item: BouncyBall): HTMLElement {
        const root = createContextMenu(item, BouncyBall.label);
        const body = menuBody(root);
        appendToneControls(body, item);
        body.appendChild(rowLabel('弹跳损耗'));
        body.appendChild(rangeControl(0, 1, 0.01, item.bounceFactor, (v) => `垂直速度 × ${v}`, (v) => { item.bounceFactor = v }));
        body.appendChild(rowLabel('摩擦损耗'));
        body.appendChild(rangeControl(0, 1, 0.01, item.frictionFactor, (v) => `水平速度 × ${v}`, (v) => { item.frictionFactor = v }));
        const note = document.createElement('div');
        note.className = 'menu-note';
        note.innerHTML = `篮球可以在地上弹跳。`;
        body.appendChild(note);
        return root;
    }

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
        const extra = data as SerializedItem & { bounceFactor?: number; frictionFactor?: number; };
        if (typeof extra.bounceFactor === 'number') { this.bounceFactor = clamp(extra.bounceFactor, 0, 1); }
        if (typeof extra.frictionFactor === 'number') { this.frictionFactor = clamp(extra.frictionFactor, 0, 1); }
        this.dragSamples.length = 0;
        this.wasDragging = false;
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
        this.render();
    }
}