// 音叉：可点击 / 持续发声，与同频音叉产生共振。

import { RES_DETUNE, RES_RANGE } from '../core/constants';
import { setFreq, waveInterval } from '../core/frequency';
import type { SerializedItem, WaveMode } from '../core/types';
import { emitWave } from '../sim/waves';
import { state } from '../state';
import { buildForkMenu } from '../ui/menus/tone';
import { Tool } from './Tool';

export class TuningFork extends Tool {
  static label = '音叉';
  static icon = '♬';
  static size: readonly [number, number] = [3, 5];
  static gravity = true;
  static shape = `
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

  freq = 316.23;
  level = 5;
  mode: WaveMode = 'click';
  emitTimer = 0;
  vib = 0;
  resonance = 0;
  resTimer = 0;

  constructor(gx: number, gy: number) {
    super(gx, gy);
    this.grounded = false;
  }

  static onMove(raw: Tool, dt: number): void {
    const item = raw as TuningFork;
    if (item.mode === 'continuous') {
      item.vib = 1;
      item.emitTimer -= dt;
      if (item.emitTimer <= 0) {
        item.emitTimer = waveInterval(item.freq);
        emitWave(item);
      }
    } else {
      item.vib = Math.max(0, item.vib - dt * 0.6);
      item.emitTimer = 0;
    }

    // 邻近同频音叉共振
    let drive = 0;
    if (item.vib < 0.95) {
      for (const other of state.items) {
        if (other === item || other.removed || !(other instanceof TuningFork)) {
          continue;
        }
        if (other.vib < 0.3) continue;
        if (Math.abs(other.freq - item.freq) / item.freq > RES_DETUNE) {
          continue;
        }
        const dx = other.px + other.w / 2 - (item.px + item.w / 2);
        const dy = other.py + other.h / 2 - (item.py + item.h / 2);
        const d = Math.hypot(dx, dy);
        if (d <= RES_RANGE) {
          drive = Math.max(drive, other.vib * (1 - d / RES_RANGE));
        }
      }
    }
    item.resonance = Math.max(item.resonance - dt * 0.9, drive);
    if (item.mode !== 'continuous' && item.resonance > 0.45) {
      item.resTimer -= dt;
      if (item.resTimer <= 0) {
        item.resTimer = waveInterval(item.freq) * 1.8;
        emitWave(item);
        item.vib = Math.max(item.vib, 0.75);
      }
    } else if (item.resonance <= 0.15) {
      item.resTimer = 0;
    }

    // 声音的视觉反馈：叉臂摆动 + 发光
    const glow = Math.max(item.vib, item.resonance);
    const svg = item.el.firstElementChild as SVGSVGElement | null;
    const tines = svg?.querySelector('.fork-tines') as SVGPathElement | null;
    if (tines) {
      const sway = Math.sin(performance.now() * 0.05 * Math.max(1, item.freq / 100)) * glow * 1.6;
      tines.setAttribute('transform', `rotate(${sway.toFixed(2)} 36 72)`);
    }
    if (svg) {
      if (glow > 0.06) {
        const rgb = item.resonance > 0.45 ? '255,175,255' : '150,225,255';
        svg.style.filter = `brightness(${(1 + glow * 0.42).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 9).toFixed(1)}px rgba(${rgb},${(0.35 + glow * 0.55).toFixed(2)}))`;
      } else {
        svg.style.filter = '';
      }
    }
  }

  static onClick(raw: Tool): void {
    const item = raw as TuningFork;
    if (item.mode !== 'click') {
      return;
    }
    emitWave(item);
    item.vib = 1;
  }

  static onContextMenu(item: Tool): HTMLElement {
    return buildForkMenu(item as TuningFork);
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
