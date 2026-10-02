// tools/TuningFork.ts
import { RES_DETUNE, RES_RANGE } from '../core/constants';
import { setFreq, waveInterval } from '../core/frequency';
import type { SerializedItem } from '../core/types';
import { emitWave } from '../sim/waves';
import { state } from '../state';
import { SoundEmitter, buildToneMenu } from './Bell';

export class TuningFork extends SoundEmitter {
  static label = '音叉';
  static icon = '<i class="fa-solid fa-music"></i>';
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

  resonance = 0;
  resTimer = 0;

  constructor(gx: number, gy: number) {
    super(gx, gy);
    this.grounded = false;
  }

  static onMove(raw: TuningFork, dt: number): void {
    super.onMove(raw, dt);
    // 邻近同频音叉共振
    let drive = 0;
    if (raw.vib < 0.95) {
      for (const other of state.items) {
        if (other === raw || other.removed || !(other instanceof TuningFork)) {
          continue;
        }
        if (other.vib < 0.3) continue;
        if (Math.abs(other.freq - raw.freq) / raw.freq > RES_DETUNE) {
          continue;
        }
        const dx = other.px + other.w / 2 - (raw.px + raw.w / 2);
        const dy = other.py + other.h / 2 - (raw.py + raw.h / 2);
        const d = Math.hypot(dx, dy);
        if (d <= RES_RANGE) {
          drive = Math.max(drive, other.vib * (1 - d / RES_RANGE));
        }
      }
    }
    raw.resonance = Math.max(raw.resonance - dt * 0.9, drive);
    // 共振发波
    if (raw.mode !== 'continuous' && raw.resonance > 0.45) {
      raw.resTimer -= dt;
      if (raw.resTimer <= 0) {
        raw.resTimer = waveInterval(raw.freq) * 1.8;
        emitWave(raw);
        raw.vib = Math.max(raw.vib, 0.75);
      }
    } else if (raw.resonance <= 0.15) {
      raw.resTimer = 0;
    }
    // 视觉反馈：叉臂摆动 + 发光
    const glow = Math.max(raw.vib, raw.resonance);
    const svg = raw.el.firstElementChild as SVGSVGElement | null;
    const tines = svg?.querySelector('.fork-tines') as SVGPathElement | null;
    if (tines) {
      const sway = Math.sin(performance.now() * 0.05 * Math.max(1, raw.freq / 100)) * glow * 1.6;
      tines.setAttribute('transform', `rotate(${sway.toFixed(2)} 36 72)`);
    }
    if (svg) {
      if (glow > 0.06) {
        const rgb = raw.resonance > 0.45 ? '255,175,255' : '150,225,255';
        svg.style.filter = `brightness(${(1 + glow * 0.42).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 9).toFixed(1)}px rgba(${rgb},${(0.35 + glow * 0.55).toFixed(2)}))`;
      } else {
        svg.style.filter = '';
      }
    }
  }

  static onClick(raw: TuningFork): void {
    if (raw.mode !== 'click') return;
    emitWave(raw);
    raw.vib = 1;
  }

  static onContextMenu(item: TuningFork): HTMLElement {
    return buildToneMenu(item, TuningFork.label);
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