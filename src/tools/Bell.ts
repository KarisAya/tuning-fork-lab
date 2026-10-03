// 铃铛：点击 / 持续发声，不参与共振。
import { DEFAULT_LEVEL, DEFAULT_FREQ, FREQ_MAX, FREQ_MIN, TOP_LEVEL, FREQ_TABLE } from '../core/constants';
import { waveInterval } from '../core/frequency';
import { clamp } from '../core/math';
import type { Point, SerializedItem } from '../core/types';
import { emitWaveAt } from '../sim/waves';
import { Tool } from './Tool';
import { button, createContextMenu, rowLabel } from '../ui/menu';
import { refreshMenu } from '../ui/menu-controller';

type WaveMode = 'click' | 'continuous';
export function setFreq(item: SoundEmitter, raw: number): void {
  let value = Number.isFinite(raw) ? raw : FREQ_MIN;
  value = clamp(value, FREQ_MIN, FREQ_MAX);
  value = Math.round(value * 100) / 100;
  item.freq = value;
  item.intv = waveInterval(value);
  item.level = FREQ_TABLE.findIndex((v) => Math.abs(v - value) < 0.005);
}
/** 按档位表上下切一档；不在档位上时取相邻档。 */
export function stepLevel(item: SoundEmitter, direction: -1 | 1): void {
  const cur = item.freq;
  if (direction > 0) {
    const next = FREQ_TABLE.find((v) => v > cur + 1e-6);
    setFreq(item, next ?? FREQ_MAX);
    return;
  }
  let prev: number | null = null;
  for (const value of FREQ_TABLE) {
    if (value < cur - 1e-6) { prev = value; }
  }
  setFreq(item, prev ?? FREQ_MIN);
}


// 发声类工具共用的菜单控件。
export function appendToneControls(body: HTMLElement, item: SoundEmitter): void {
  body.appendChild(rowLabel('发声模式'));
  const modeRow = document.createElement('div');
  modeRow.className = 'menu-row menu-row-cells';
  modeRow.appendChild(button('点击发声', () => { item.mode = 'click'; item.emitTimer = 0; refreshMenu(item); }, item.mode === 'click'));
  modeRow.appendChild(button('持续发声', () => { item.mode = 'continuous'; item.emitTimer = 0; refreshMenu(item); }, item.mode === 'continuous'));
  body.appendChild(modeRow);
  body.appendChild(rowLabel('频率（Hz）'));
  const freqRow = document.createElement('div');
  freqRow.className = 'menu-row';
  const input = document.createElement('input');
  input.className = 'menu-input';
  input.type = 'number';
  input.min = String(FREQ_MIN);
  input.max = String(FREQ_MAX);
  input.step = '0.01';
  input.value = item.freq.toFixed(2);
  input.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  input.addEventListener('change', () => {
    setFreq(item, Number(input.value));
    refreshMenu(item);
  });
  const down = button('▼', () => {
    stepLevel(item, -1);
    refreshMenu(item);
  });
  const up = button('▲', () => {
    stepLevel(item, 1);
    refreshMenu(item);
  });
  freqRow.append(down, input, up);
  body.appendChild(freqRow);
  const info = document.createElement('div');
  info.className = 'menu-note';
  const where = item.level >= 0
    ? `档位 ${item.level} / ${TOP_LEVEL}`
    : '自定义频率';
  info.innerHTML = `${where} · ${item.freq.toFixed(2)} Hz<br>`
    + `发射间隔 ${waveInterval(item.freq).toFixed(3)} 秒 / 个<br>`
    + `范围 ${FREQ_MIN} ~ ${FREQ_MAX} Hz`;
  body.appendChild(info);
}
export abstract class SoundEmitter extends Tool {
  freq: number = DEFAULT_FREQ;
  intv: number = waveInterval(DEFAULT_FREQ);
  level: number = DEFAULT_LEVEL;
  mode: WaveMode = 'click';
  /** 发声计时器 （归一化） */
  emitTimer: number = 0;
  get emissionPoint(): Point { return [this.px + this.w / 2, this.py + this.h / 2]; }
  /** 触发一次发声（点击） */
  protected emitOnce(): void {
    this.emitTimer = 1
    const source = this.emissionPoint
    emitWaveAt(source[0], source[1], this.freq);
  }
  protected onClick(): void { this.emitOnce(); }
  protected onTick(dt: number): void {
    if (this.emitTimer > 0) { this.emitTimer -= dt / this.intv; }
    else if (this.mode === 'continuous') { this.emitOnce() }
  }
  static contextMenu(item: SoundEmitter): HTMLElement {
    const [root, body] = createContextMenu(item, this.label);
    appendToneControls(body, item);
    return root;
  }

  serialize(): SerializedItem {
    return {
      ...super.serialize(),
      freq: this.freq,
      mode: this.mode,
    };
  }

  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    if (typeof data.freq === 'number') { setFreq(this, data.freq); }
    if (data.mode === 'continuous' || data.mode === 'click') { this.mode = data.mode; }
  }
}

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