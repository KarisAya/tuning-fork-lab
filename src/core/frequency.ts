// 频率相关的换算：频率 ↔ 色相、发射间隔、档位。

import { EMIT_FAST, EMIT_SLOW, FREQ_MAX, FREQ_MIN } from './constants';
import { clamp } from './math';

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
