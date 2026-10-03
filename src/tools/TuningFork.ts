// tools/TuningFork.ts
import { GRID, WAVE_SPEED } from '../core/constants';
import { state } from '../state';
import { Bell } from './Bell';
import { pushWave, makeWave } from '../sim/waves';
// 音叉共振
const RES_RANGE = GRID * 8;
const RES_DETUNE = 0.035;

export class TuningFork extends Bell {
  static label = '音叉';
  static icon = '<i class="fa-solid fa-music"></i>';
  static size: readonly [number, number] = [3, 5];
  static physics = true;
  static shape = `\
<svg viewBox="0 0 72 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fork-metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbfdff"/>
      <stop offset=".32" stop-color="#d8e7f8"/>
      <stop offset=".68" stop-color="#7d9bbd"/>
      <stop offset="1" stop-color="#46658a"/>
    </linearGradient>
    <linearGradient id="fork-side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef6ff"/>
      <stop offset="1" stop-color="#5b7698"/>
    </linearGradient>
    <filter id="fork-shadow" x="-60%" y="-30%" width="220%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#040815" flood-opacity=".8"/>
    </filter>
  </defs>
  <g filter="url(#fork-shadow)">
    <path class="fork-tines" fill="url(#fork-metal)" d="M13 11c-4 0-6 3-6 7v35c0 12 6 19 17 22V31c0-7-4-20-11-20zm46 0c-7 0-11 13-11 20v44c11-3 17-10 17-22V18c0-4-2-7-6-7z"/>
    <path fill="url(#fork-metal)" d="M22 70h28c-2 7-7 12-14 14-7-2-12-7-14-14z"/>
    <rect x="31" y="80" width="10" height="27" rx="5" fill="url(#fork-side)"/>
    <path d="M26 106h20c3 0 5 2 5 5v2H21v-2c0-3 2-5 5-5z" fill="url(#fork-metal)"/>
    <ellipse cx="36" cy="113" rx="12" ry="3" fill="#314864" opacity=".8"/>
  </g>
  <path class="hit-hint" d="M7 8h58v109H7z"/>
</svg>`;

  readonly glowColor = [255, 175, 255]
  tines: SVGPathElement
  timers: Array<(dt: number) => boolean>;

  constructor(gx: number, gy: number) {
    super(gx, gy);
    this.timers = [];
    this.tines = this.svg.querySelector('.fork-tines') as SVGPathElement;
  }
  private resonance(other: TuningFork): void {
    const ratio = other.freq > this.freq ? other.freq / this.freq : this.freq / other.freq;
    if (Math.abs(ratio - Math.round(ratio)) > RES_DETUNE) { return; }
    const dx = other.px - this.px
    const dy = other.py - this.py
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > RES_RANGE) { return; }
    let t = d / WAVE_SPEED;
    // t 秒后执行
    this.timers.push((dt: number) => {
      t -= dt;
      if (t > 0) { return false; }
      if (other.removed) { return true; }
      if (other.emitTimer > 0) { return true; }
      other.emitTimer = 1;
      const source = other.emissionPoint
      const wave = makeWave(source[0], source[1], other.freq)
      wave.travelDistance = d
      wave.skipTag = true
      pushWave(wave);
      return true;
    });
  }

  emitOnce(): void {
    super.emitOnce();
    for (const other of state.items) {
      if (other.removed) { continue; }
      if (other === this) { continue; }
      if (!(other instanceof TuningFork)) { continue; }
      this.resonance(other)
    }
  }

  onTick(dt: number): void {
    super.onTick(dt);
    this.timers = this.timers.filter(fn => !fn(dt));
    if (this.emitTimer > 0) {
      const sway = Math.sin(performance.now() / this.intv) * this.glow * 1.6;
      this.tines.setAttribute('transform', `rotate(${sway.toFixed(2)} 36 72)`);
    }
  }
}