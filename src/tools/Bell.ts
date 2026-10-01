// 铃铛：点击 / 持续发声，不参与共振。

import { setFreq, waveInterval } from '../core/frequency';
import type { SerializedItem, WaveMode } from '../core/types';
import { emitWave } from '../sim/waves';
import { buildToneMenu } from '../ui/menus/tone';
import { Tool } from './Tool';

export class Bell extends Tool {
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

  freq = 316.23;
  level = 5;
  mode: WaveMode = 'click';
  emitTimer = 0;
  vib = 0;

  static onMove(raw: Tool, dt: number): void {
    const item = raw as Bell;
    item.vib = Math.max(0, item.vib - dt * 0.8);
    if (item.mode === 'continuous') {
      item.vib = Math.max(item.vib, 0.9);
      item.emitTimer -= dt;
      if (item.emitTimer <= 0) {
        item.emitTimer = waveInterval(item.freq);
        emitWave(item);
      }
    } else {
      item.emitTimer = 0;
    }
    const svg = item.el.firstElementChild as SVGSVGElement | null;
    if (!svg) return;
    const glow = item.vib;
    svg.style.filter = glow > 0.05
      ? `brightness(${(1 + glow * 0.45).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 8).toFixed(1)}px rgba(255,215,105,${(0.28 + glow * 0.58).toFixed(2)}))`
      : '';
  }

  static onClick(raw: Tool): void {
    const item = raw as Bell;
    if (item.mode !== 'click') {
      return;
    }
    emitWave(item);
    item.vib = 1;
  }

  static onRelease(raw: Tool): void {
    const item = raw as Bell;
    item.snapToGrid();
    item.render();
  }

  static onContextMenu(item: Tool): HTMLElement {
    return buildToneMenu(item as Bell, '铃铛');
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
    this.snapToGrid();
    this.render();
  }
}
