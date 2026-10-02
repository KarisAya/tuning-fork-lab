// 铃铛：点击 / 持续发声，不参与共振。
import { DEFAULT_LEVEL, DEFAULT_FREQ, FREQ_MAX, FREQ_MIN, TOP_LEVEL } from '../core/constants';
import { setFreq, stepLevel, waveInterval } from '../core/frequency';
import type { Point, WaveMode, SerializedItem } from '../core/types';
import { emitWaveAt } from '../sim/waves';
import { Tool } from './Tool';
import { button, createContextMenu, menuBody, rowLabel } from '../ui/menu';
import { refreshMenu } from '../ui/menu-controller';


// 发声类工具共用的菜单控件。

/** 频率、档位、发声模式；`mode` 为 false 时不出模式开关（小车用）。 */
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
  freq = DEFAULT_FREQ;
  level = DEFAULT_LEVEL;
  mode: WaveMode = 'click';
  emitTimer = 0;
  get emissionPoint(): Point { return [this.px + this.w / 2, this.py + this.h / 2]; }
  /** 触发一次发声（点击） */
  protected emitOnce(): void {
    const source = this.emissionPoint
    emitWaveAt(source[0], source[1], this.freq);
  }

  protected tickEmission(dt: number) {
    this.emitTimer -= dt;
    if (this.emitTimer <= 0) {
      this.emitTimer = waveInterval(this.freq);
      this.emitOnce()
    }
  }

  static onClick(raw: SoundEmitter): void { raw.emitOnce(); }
  static onMove(raw: SoundEmitter, dt: number): void {
    if (raw.mode === 'continuous') { raw.tickEmission(dt) }
    else { raw.emitTimer = 0; }
  }

  static onContextMenu(item: SoundEmitter): HTMLElement {
    const C = this.constructor as typeof SoundEmitter;
    const root = createContextMenu(item, C.label);
    appendToneControls(menuBody(root), item);
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
  static shape = `
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
  static onMove(raw: Bell, dt: number): void {
    super.onMove(raw, dt);
    // 发光视觉反馈
    const svg = raw.el.firstElementChild as SVGSVGElement | null;
    if (!svg) return;
    const glow = raw.emitTimer;
    svg.style.filter = glow > 0.05 ? `brightness(${(1 + glow * 0.45).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 8).toFixed(1)}px rgba(255,215,105,${(0.28 + glow * 0.58).toFixed(2)}))` : '';
  }
  static onRelease(raw: Bell): void { raw.snapToGrid(); }
}