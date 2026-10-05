import { GRAVITY, MAX_THROW_SPEED } from '../core/constants';
import type { SerializedItem } from '../core/types';
import { clamp } from '../core/math';
import { FixedQueue } from './Tool';
import { Bell } from './Bell';
import { appendToneControls } from './SoundEmitter';
import { rangeControl, rowLabel, createContextMenu } from '../ui/menu';

type MouseSample = [number, number, number]
export abstract class ThrowableBell extends Bell {
  static physics = true;
  static maxThrowSpeed = MAX_THROW_SPEED
  speed = 1;
  private mouseSamples = new FixedQueue<MouseSample>(8);

  onMove(px: number, py: number): void {
    super.onMove(px, py);
    this.mouseSamples.append([px, py, performance.now()]);
  }

  onRelease(): void {
    super.onRelease();
    if (this.mouseSamples.length < 2) { return; }
    const [x, y, t] = this.mouseSamples.at(-1);
    const [x0, y0, t0] = this.mouseSamples.at(-2);
    const dt = (t - t0) / 1000;
    const dx = x - x0;
    const dy = y - y0;
    const v = (this.constructor as typeof ThrowableBell).limitV(dx / dt, dy / dt);
    this.vx = v[0];
    this.vy = v[1];
  }

  private static limitV(vx: number, vy: number): [number, number] {
    const speedSq = vx * vx + vy * vy;
    const maxSpeedSq = this.maxThrowSpeed * this.maxThrowSpeed;
    if (speedSq <= maxSpeedSq) { return [vx, vy]; }
    const scale = this.maxThrowSpeed / Math.sqrt(speedSq);
    return [vx * scale, vy * scale,];
  }
}

const DEFAULT_BOUNCE_FACTOR = 0.8;
const DEFAULT_FRICTION_FACTOR = 0.8;
const MIN_BOUNCE_SPEED = 30;


export class BouncyBall extends ThrowableBell {
  static label = '篮球';
  static icon = '<i class="fa-solid fa-basketball"></i>';
  static size: readonly [number, number] = [2, 2];
  static shape = `\
  <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
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
  <path d=" M24 5 C30 11 32 18 31 24 C30 31 25 37 18 42 " fill="none" stroke="#6d2915" stroke-width="2" opacity=".75" />
  <path d=" M7 18 C14 19 20 17 24 13 C27 10 30 7 33 6 " fill="none" stroke="#6d2915" stroke-width="2" opacity=".72" />
  <path d=" M11 36 C18 33 26 34 34 38 " fill="none" stroke="#6d2915" stroke-width="2" opacity=".7" />
  <circle cx="16" cy="13" r="5" fill="#fff7df" opacity=".28" />
  <circle cx="19" cy="16" r="2" fill="#fffbe9" opacity=".32" />
</svg>`;
  static friction = GRAVITY * 0.2;

  bounceFactor = DEFAULT_BOUNCE_FACTOR;
  frictionFactor = DEFAULT_FRICTION_FACTOR;

  protected onLand(landY: number): void {
    const impactVelocity = this.vy;
    const bounceVelocity = -impactVelocity * this.bounceFactor;
    if (Math.abs(bounceVelocity) < MIN_BOUNCE_SPEED) {
      this.vy = 0;
      this.grounded = true;
      this.py = landY;
      return
    } else {
      if (this.mode === 'click') { this.emitOnce(); }
      this.vy = bounceVelocity;
    }
  }

  protected onStable(): void { }

  static contextMenu(item: BouncyBall): HTMLElement {
    const [root, body] = createContextMenu(item, this.label);
    appendToneControls(body, item);
    body.appendChild(rowLabel('弹跳损耗'));
    body.appendChild(rangeControl(0, 1, 0.01, item.bounceFactor, (value) => `垂直速度 × ${value}`, (value) => { item.bounceFactor = value; }));
    body.appendChild(rowLabel('摩擦损耗'));
    body.appendChild(rangeControl(0, 1, 0.01, item.frictionFactor, (value) => `水平速度 × ${value}`, (value) => { item.frictionFactor = value; }));
    const note = document.createElement('div');
    note.className = 'menu-note';
    note.textContent = '篮球可以在地上弹跳。';
    body.appendChild(note);
    return root;
  }

  serialize(): SerializedItem {
    return {
      ...super.serialize(),
      bounceFactor: this.bounceFactor,
      frictionFactor: this.frictionFactor,
    };
  }

  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    const extra = data as SerializedItem & { bounceFactor?: number, frictionFactor?: number };
    if (typeof extra.bounceFactor === 'number') { this.bounceFactor = clamp(extra.bounceFactor, 0, 1,); }
    if (typeof extra.frictionFactor === 'number') { this.frictionFactor = clamp(extra.frictionFactor, 0, 1,); }
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.render();
  }
}