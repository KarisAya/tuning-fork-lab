import { SoundEmitter } from './SoundEmitter';

export class Bell extends SoundEmitter {
  static label = '铃铛';
  static icon = '<i class="fa-regular fa-bell"></i>';
  static size: readonly [number, number] = [1, 1];
  static physics = false;
  static shape = `\
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bell-orb" cx="34%" cy="28%" r="78%">
      <stop offset="0" stop-color="#fff5c7"/>
      <stop offset=".38" stop-color="#f4cd58"/>
      <stop offset=".78" stop-color="#ca8b1e"/>
      <stop offset="1" stop-color="#7b4e0b"/>
    </radialGradient>
  </defs>
  <circle class="hit-hint" cx="12" cy="12" r="10.5"/>
  <circle cx="12" cy="11" r="9.25" fill="url(#bell-orb)" stroke="#f8e49a" stroke-width="1"/>
  <circle cx="9" cy="8" r="2.4" fill="#fff8dc" opacity=".42"/>
  <circle cx="12" cy="12" r="3.15" fill="#ffeaa3" opacity=".48"/>
  <circle cx="12" cy="12" r="1.25" fill="#8f5d12" opacity=".8"/>
</svg>`;
  glow: number;
  svg: SVGSVGElement;
  readonly glowColor = [255, 215, 105]
  constructor(gx: number, gy: number) {
    super(gx, gy);
    this.glow = 0;
    this.svg = this.el.firstElementChild as SVGSVGElement
  }
  onTick(dt: number): void {
    super.onTick(dt);
    if (this.emitTimer > 0) {
      this.glow = this.glow + (this.emitTimer - this.glow) * Math.min(dt * 8, 1);
      const glow = this.glow
      const [r, g, b] = this.glowColor;
      const br = (1 + glow * 0.45).toFixed(2);
      const bl = (3 + glow * 8).toFixed(1);
      const a = (0.28 + glow * 0.58).toFixed(2);
      this.svg.style.filter = `brightness(${br}) drop-shadow(0 0 ${bl}px rgba(${r},${g},${b},${a}))`;
    } else { this.svg.style.filter = ''; }
  }
}