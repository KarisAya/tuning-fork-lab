// 采样密度：控件值与模拟状态的双向同步。

import { SAMPLE_MAX, SAMPLE_MIN, SAMPLE_STEP } from '../core/constants';
import { clamp } from '../core/math';
import { state } from '../state';
import { sampleRange, sampleVal } from './dom';

export function setSampleDensity(raw: number): void {
  const n = clamp(Math.round(raw / SAMPLE_STEP) * SAMPLE_STEP, SAMPLE_MIN, SAMPLE_MAX);
  sampleRange.value = String(n);
  sampleVal.textContent = String(n);
  // 采样密度只影响后续取点，不重建已有波形对象。
  state.samples = n;
}
