// tools/Car.ts
import { GRAVITY } from '../core/constants';
import { clamp } from '../core/math';
import type { SerializedItem } from '../core/types';
import { state, FixedQueue } from '../state';
import { setFreq, Bell, appendToneControls } from './Bell';
import { button, createContextMenu, rowLabel } from '../ui/menu';
import { placeMenu, refreshMenu } from '../ui/menu-controller';

// 小车
const CAR_SPEED_MAX = 2;
const MAX_THROW_SPEED = 3200;
const FRICTION = 0.25 * GRAVITY;

type RawV = [number, number, number]
export class Car extends Bell {
  static label = '小车';
  static icon = '<i class="fa-solid fa-car-side"></i>';
  static size: readonly [number, number] = [3, 2];
  static physics = true;
  static friction = FRICTION;
  static shape = `
    <svg viewBox="0 0 72 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="car-bell" cx="32%" cy="26%" r="78%">
          <stop offset="0" stop-color="#fff4c7"/>
          <stop offset=".36" stop-color="#f0c94f"/>
          <stop offset=".8" stop-color="#bd7e16"/>
          <stop offset="1" stop-color="#724607"/>
        </radialGradient>
        <linearGradient id="car-axle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#546680"/>
          <stop offset=".5" stop-color="#aebbd0"/>
          <stop offset="1" stop-color="#546680"/>
        </linearGradient>
        <radialGradient id="car-wheel" cx="35%" cy="30%">
          <stop offset="0" stop-color="#8191aa"/>
          <stop offset=".42" stop-color="#36435b"/>
          <stop offset="1" stop-color="#151d2c"/>
        </radialGradient>
      </defs>
      <rect class="hit-hint" x="3" y="3" width="66" height="42" rx="10"/>
      <rect x="15" y="32" width="42" height="4" rx="2" fill="url(#car-axle)"/>
      <circle cx="19" cy="39" r="8" fill="url(#car-wheel)" stroke="#101827" stroke-width="1.5" class="car-wheel"/>
      <circle cx="53" cy="39" r="8" fill="url(#car-wheel)" stroke="#101827" stroke-width="1.5" class="car-wheel"/>
      <circle cx="19" cy="39" r="2.8" fill="#c4d1e3"/>
      <circle cx="53" cy="39" r="2.8" fill="#c4d1e3"/>
      <circle cx="36" cy="19" r="13.5" fill="url(#car-bell)" stroke="#f7df8e" stroke-width="1.5"/>
      <circle cx="31.5" cy="14.5" r="3.5" fill="#fff8dd" opacity=".34"/>
      <circle cx="36" cy="19" r="4.1" fill="#ffedab" opacity=".45"/>
      <circle cx="36" cy="19" r="1.65" fill="#8e5a0f" opacity=".85"/>
      <path d="M29 29h14" stroke="#8d5f11" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
    </svg>`;

  running: -1 | 0 | 1 = 0;
  nextRunning: -1 | 0 | 1 = 1;
  speed = 1;
  vRec = new FixedQueue<RawV>(8);
  stepPhysics(dt: number): void {
    super.applyGravity(dt);
    if (this.grounded) {
      if (this.running) {
        const v = state.waveSpeed * this.speed;
        const dv = v * dt
        const vx = this.vx;
        if (Math.abs(v - Math.abs(- vx)) < dv) { this.vx = v * this.running; }
        else {
          if (this.running === 1) {
            if (vx >= 0 && vx < v) { this.vx += dv; }
            else { this.vx -= dv * 5 * Math.sign(vx); }
          }
          else {
            if (vx <= 0 && vx > -v) { this.vx -= dv; }
            else { this.vx -= dv * 5 * Math.sign(vx) }
          }
        }
      } else {
        const C = this.constructor as typeof Car;
        const friction = C.friction * dt;
        if (this.vx > friction) { this.vx -= friction; }
        else if (this.vx < -friction) { this.vx += friction; }
        else { this.vx = 0; }
      }
    }
    this.px += this.vx * dt;
    super.applyRebound();

  }

  onStable(): void { }

  onTick(dt: number): void {
    super.onTick(dt);
    if (this.running && this.emitTimer <= 0) { this.emitOnce(); }
  }

  onClick(): void {
    if (!this.running) { super.onClick(); }
  }

  onMove(px: number, py: number): void {
    super.onMove(px, py);
    this.vRec.append([px, py, performance.now()]);
  }

  onRelease(): void {
    super.onRelease();
    if (this.vRec.length < 2) { return; }
    const [x, y, t] = this.vRec.at(-1);
    const [x0, y0, t0] = this.vRec.at(-2);
    const dt = (t - t0) / 1000;
    const dx = x - x0;
    const dy = y - y0;
    const v = this.limitV(dx / dt, dy / dt);
    this.vx = v[0];
    this.vy = v[1];
  }
  private limitV(vx: number, vy: number): [number, number] {
    const speedSq = vx * vx + vy * vy;
    const maxSpeedSq = MAX_THROW_SPEED * MAX_THROW_SPEED;
    if (speedSq <= maxSpeedSq) { return [vx, vy]; }
    const scale = MAX_THROW_SPEED / Math.sqrt(speedSq);
    return [vx * scale, vy * scale,];
  }

  static contextMenu(item: Car): HTMLElement {
    const [root, body] = createContextMenu(item, '小车 · 移动声源');
    body.appendChild(rowLabel('运行状态'));
    const runRow = document.createElement('div');
    runRow.className = 'menu-row menu-row-cells';
    runRow.appendChild(button('← 向左', () => { item.running = -1; refreshMenu(item); }, item.running === -1
    ));
    runRow.appendChild(button(item.running === 0 ? '⏹ 停止' : '▶ 启动', () => {
      if (item.running === 0) {
        item.running = item.nextRunning;
      } else {
        item.nextRunning = item.running;
        item.running = 0;
      }
      refreshMenu(item);
    }, !item.running));
    runRow.appendChild(button('→ 向右', () => { item.running = 1; refreshMenu(item); }, item.running === 1));
    body.appendChild(runRow);
    const speedRow = document.createElement('div');
    speedRow.className = 'menu-row menu-row-cells';
    speedRow.appendChild(button('− 0.2', () => {
      item.speed = clamp(Math.round((item.speed - 0.2) * 10) / 10, 0.2, CAR_SPEED_MAX);
      speedOut.textContent = `${item.speed.toFixed(1)} 马赫`;
      placeMenu();
    }));
    const speedOut = document.createElement('strong');
    speedOut.className = 'menu-value';
    speedOut.textContent = `${item.speed.toFixed(1)} 马赫`;
    speedRow.appendChild(speedOut);
    speedRow.appendChild(button('+ 0.2', () => {
      item.speed = clamp(Math.round((item.speed + 0.2) * 10) / 10, 0.2, CAR_SPEED_MAX);
      speedOut.textContent = `${item.speed.toFixed(1)} 马赫`;
      placeMenu();
    }));
    body.appendChild(speedRow);
    appendToneControls(body, item);
    const note = document.createElement('div');
    note.className = 'menu-note';
    note.textContent = `移动中持续发出 ${item.freq.toFixed(2)} Hz 声波。`;
    body.appendChild(note);
    return root;
  }

  serialize(): SerializedItem {
    return { ...super.serialize(), speed: this.speed };
  }

  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    if (typeof data.speed === 'number') {
      this.speed = clamp(Math.round(data.speed * 10) / 10, 0.1, CAR_SPEED_MAX);
    }
    this.running = 0
    if (typeof data.freq === 'number') {
      setFreq(this, data.freq);
    }
    this.emitTimer = 0;
    this.grounded = false;
    this.render();
  }
}