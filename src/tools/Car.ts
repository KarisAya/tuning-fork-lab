// 小车：会自己横穿桌面的移动声源。


import { DEFAULT_LEVEL, DEFAULT_FREQ, CAR_CROSS_TIME, CAR_SPEED_MAX } from '../core/constants';
import { setFreq, waveInterval } from '../core/frequency';
import { clamp } from '../core/math';
import type { SerializedItem } from '../core/types';
import { emitWave } from '../sim/waves';
import { state } from '../state';
import { buildCarMenu } from '../ui/menus/car';
import { Tool } from './Tool';

export class Car extends Tool {
  static label = '小车';
  static icon = '🚗';
  static size: readonly [number, number] = [3, 2];
  static gravity = true;
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

  running = false;
  speed = 1;
  direction: -1 | 1 = 1;
  emitTimer = 0;
  freq = DEFAULT_FREQ;
  level = DEFAULT_LEVEL;
  wheelPhase = 0;

  static spawnY(maxGY: number): number {
    return maxGY;
  }

  get hasSelfPropulsion(): boolean {
    return this.running;
  }

  update(dt: number): void {
    if (!this.dragging && this.running && this.grounded) {
      const support = this.supportY();
      if (this.py < support - 1) {
        this.grounded = false;
      }
    }
    if (!this.dragging && this.running && this.grounded) {
      const travelWidth = Math.max(1, state.deskW - this.w);
      const pxPerSecond = (travelWidth / CAR_CROSS_TIME) * this.speed;
      this.vx = this.direction * pxPerSecond;
      this.px += this.vx * dt;
      this.emitTimer -= dt;
      if (this.emitTimer <= 0) {
        this.emitTimer += waveInterval(this.freq);
        emitWave(this);
      }
      const maxX = Math.max(0, state.deskW - this.w);
      if (this.px <= 0 || this.px >= maxX) {
        this.px = clamp(this.px, 0, maxX);
        this.running = false;
        this.emitTimer = 0;
        this.vx = 0;
        this.grounded = true;
        this.snapToGrid();
      }
      Car.onMove(this, dt);
      this.render();
      return;
    }
    super.update(dt);
  }

  static onMove(raw: Tool, dt: number): void {
    const item = raw as Car;
    if (item.running) {
      item.wheelPhase += Math.abs(item.vx) * dt / 9.5;
    }
    const wheels = item.el.querySelectorAll<SVGCircleElement>('.car-wheel');
    const angle = item.wheelPhase.toFixed(2);
    wheels.forEach((wheel) => {
      wheel.setAttribute('transform', `rotate(${angle} ${wheel.getAttribute('cx')} ${wheel.getAttribute('cy')})`);
    });
  }

  static onContextMenu(item: Tool): HTMLElement {
    return buildCarMenu(item as Car);
  }

  serialize(): SerializedItem {
    return {
      ...super.serialize(),
      running: this.running,
      speed: this.speed,
      direction: this.direction,
      freq: this.freq,
    };
  }

  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    if (typeof data.speed === 'number') {
      this.speed = clamp(Math.round(data.speed * 10) / 10, 0.1, CAR_SPEED_MAX);
    }
    if (data.direction === -1 || data.direction === 1) {
      this.direction = data.direction;
    }
    if (typeof data.freq === 'number') {
      setFreq(this, data.freq);
    }
    if (typeof data.running === 'boolean') {
      this.running = data.running;
    }
    this.emitTimer = 0;
    this.grounded = false;
    this.render();
  }
}
