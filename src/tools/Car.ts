// tools/Car.ts
import { GRAVITY, RESTITUTION } from '../core/constants';
import type { SerializedItem } from '../core/types';
import { clamp } from '../core/math';
import { state } from '../core/state';
import { FixedQueue } from './Tool';
import { setFreq, appendToneControls } from './SoundEmitter';
import { ThrowableBell } from "./BouncyBall"
import { rowLabel, button, createContextMenu, refreshMenu } from '../ui/menu';
// 小车
const CAR_SPEED_MAX = 2;
const FRICTION = 0.25 * GRAVITY;

type RawV = [number, number, number]
export class Car extends ThrowableBell {
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
        const uSpeed = state.waveSpeed * this.speed;
        const speed = this.running * uSpeed;
        const dv = uSpeed * dt;
        const diff = speed - this.vx;
        if (Math.abs(diff) < dv) { this.vx = speed; }
        else {
          const factor = Math.sign(diff) === Math.sign(this.vx) ? 1 : 3.8;
          this.vx += Math.sign(diff) * dv * factor;
        }
        if (this.px <= 0 || this.px + this.w >= state.deskW) {
          if (this.px <= 0) {
            this.px = 0;
            this.running = 1;
          }
          else {
            this.px = state.deskW - this.w;
            this.running = -1
          }
          const vx = -this.vx * RESTITUTION;
          this.vx = Math.abs(vx) > uSpeed ? vx : -speed;
        }
        this.px += this.vx * dt;
        return;
      } else {
        const C = this.constructor as typeof Car;
        const friction = C.friction * dt;
        if (this.vx > friction) { this.vx -= friction; }
        else if (this.vx < -friction) { this.vx += friction; }
        else { this.vx = 0; }
      }
    }
    super.applyRebound();
    this.px += this.vx * dt;
  }

  onStable(): void { }

  onTick(dt: number): void {
    super.onTick(dt);
    if (this.running && this.emitTimer <= 0) { this.emitOnce(); }
  }

  onClick(): void {
    if (this.running) { this.running = 0; }
    else { super.onClick(); }
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
      refreshMenu(item);
    }));
    const speedOut = document.createElement('strong');
    speedOut.className = 'menu-value';
    speedOut.textContent = `${item.speed.toFixed(1)} 马赫`;
    speedRow.appendChild(speedOut);
    speedRow.appendChild(button('+ 0.2', () => {
      item.speed = clamp(Math.round((item.speed + 0.2) * 10) / 10, 0.2, CAR_SPEED_MAX);
      speedOut.textContent = `${item.speed.toFixed(1)} 马赫`;
      refreshMenu(item);
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