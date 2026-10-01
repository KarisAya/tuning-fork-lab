// 频率相关的换算：频率 ↔ 色相、发射间隔、档位。

import { EMIT_FAST, EMIT_SLOW, FREQ_MAX, FREQ_MIN, FREQ_TABLE } from './constants';
import { clamp } from './math';
import type { TunedSource } from './types';

/** 频率在对数刻度上的归一化位置（0 = 最低档，1 = 最高档）。 */
export function freqNorm(freq: number): number {
  return clamp(Math.log10(clamp(freq, FREQ_MIN, FREQ_MAX) / FREQ_MIN) / 3, 0, 1);
}

/** 频率 → 色相：低频偏红，高频偏紫。 */
export function freqHue(freq: number): number {
  return freqNorm(freq) * 270;
}

/** 频率 → 发射间隔（秒）。 */
export function waveInterval(freq: number): number {
  return EMIT_SLOW * Math.pow(EMIT_FAST / EMIT_SLOW, freqNorm(freq));
}

export function setFreq(item: TunedSource, raw: number): void {
  let value = Number.isFinite(raw) ? raw : FREQ_MIN;
  value = clamp(value, FREQ_MIN, FREQ_MAX);
  value = Math.round(value * 100) / 100;
  item.freq = value;
  item.level = FREQ_TABLE.findIndex((v) => Math.abs(v - value) < 0.005);
}

/** 按档位表上下切一档；不在档位上时取相邻档。 */
export function stepLevel(item: TunedSource, direction: -1 | 1): void {
  const cur = item.freq;
  if (direction > 0) {
    const next = FREQ_TABLE.find((v) => v > cur + 1e-6);
    setFreq(item, next ?? FREQ_MAX);
    return;
  }
  let prev: number | null = null;
  for (const value of FREQ_TABLE) {
    if (value < cur - 1e-6) {
      prev = value;
    }
  }
  setFreq(item, prev ?? FREQ_MIN);
}
