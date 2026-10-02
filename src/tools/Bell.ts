// 铃铛：点击 / 持续发声，不参与共振。
import { DEFAULT_LEVEL, DEFAULT_FREQ, FREQ_MAX, FREQ_MIN, TOP_LEVEL } from '../core/constants';
import { setFreq, stepLevel, waveInterval } from '../core/frequency';
import type { Removable, TunedSource, WaveMode, SerializedItem } from '../core/types';
import { emitWave } from '../sim/waves';
import { Tool } from './Tool';
import { button, createContextMenu, menuBody, rowLabel } from '../ui/menu';
import { refreshMenu } from '../ui/menu-controller';


// 发声类工具共用的菜单控件。

export interface ToneControls extends TunedSource, Removable {
  mode: WaveMode;
  emitTimer: number;
  vib: number;
}

/** 频率、档位、发声模式；`mode` 为 false 时不出模式开关（小车用）。 */
export function appendToneControls(
  body: HTMLElement,
  item: ToneControls,
): void {

  body.appendChild(rowLabel('发声模式'));
  const modeRow = document.createElement('div');
  modeRow.className = 'menu-row';
  modeRow.append(
    button('点击发声', () => {
      item.mode = 'click';
      item.emitTimer = 0;
      item.vib = Math.min(item.vib, 0.2);
      refreshMenu(item);
    }, item.mode === 'click'),
    button('持续发声', () => {
      item.mode = 'continuous';
      item.emitTimer = 0;
      refreshMenu(item);
    }, item.mode === 'continuous'),
  );
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

export function buildToneMenu(item: ToneControls, title: string): HTMLElement {
  const root = createContextMenu(item, title);
  appendToneControls(menuBody(root), item);
  return root;
}

export abstract class SoundEmitter extends Tool {
  freq = DEFAULT_FREQ;
  level = DEFAULT_LEVEL;
  mode: WaveMode = 'click';
  emitTimer = 0;
  vib = 0;

  /** 触发一次发声（点击） */
  protected emitOnce(): void {
    emitWave(this);
    this.vib = 1;
  }

  /**
   * 每帧更新发声计时器
   * @param dt 时间增量
   * @param emitting 当前是否应该持续发声
   * @returns 是否在本帧发出了新的波
   */
  protected tickEmission(dt: number, emitting: boolean): boolean {
    // 振动自然衰减
    this.vib = Math.max(0, this.vib - dt * 0.8);

    if (emitting) {
      this.emitTimer -= dt;
      if (this.emitTimer <= 0) {
        this.emitTimer = waveInterval(this.freq);
        emitWave(this);
        return true;
      }
    } else {
      this.emitTimer = 0;
    }
    return false;
  }

  static onClick(raw: SoundEmitter): void {
    if (raw.mode !== 'click') return;
    raw.emitOnce();
  }
  static onMove(raw: SoundEmitter, dt: number): void {
    if (raw.mode === 'continuous') {
      // 持续模式下保持较高振动强度，并持续发波
      raw.vib = Math.max(raw.vib, 0.9);
      raw.tickEmission(dt, true);
    } else {
      // 点击模式下振动自然衰减，不持续发波
      raw.vib = Math.max(0, raw.vib - dt * 0.8);
      raw.emitTimer = 0;
    }
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
    if (typeof data.freq === 'number') {
      setFreq(this, data.freq);
    }
    if (data.mode === 'continuous' || data.mode === 'click') {
      this.mode = data.mode;
    }
  }
}

export class Bell extends SoundEmitter {
  static label = '铃铛';
  static icon = '🔔';
  static size: readonly [number, number] = [1, 1];
  static gravity = false;
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
    const glow = raw.vib;
    svg.style.filter = glow > 0.05
      ? `brightness(${(1 + glow * 0.45).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 8).toFixed(1)}px rgba(255,215,105,${(0.28 + glow * 0.58).toFixed(2)}))`
      : '';
  }

  static onRelease(raw: Bell): void {
    raw.snapToGrid();
    raw.render();
  }

  static onContextMenu(item: Bell): HTMLElement {
    return buildToneMenu(item, '铃铛');
  }
  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    // 基类已处理 freq 和 mode
    this.snapToGrid();
    this.render();
  }
}