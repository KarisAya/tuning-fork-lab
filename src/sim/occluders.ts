// 遮挡体采集：把「能挡波的工具」折算成波计算用的线段快照。

import { GRID } from '../core/constants';
import type { Point, Segment, Occluder } from '../core/types';
import { state } from '../state';

export const HALF_GRID_SQ = GRID * GRID / 4;
export function isPointOnSegment(p: Point, seg: Segment) {
  return dSqPointSeg(p, seg) > HALF_GRID_SQ
}

export function collectOccluders(): void {
  // 1. 收集当前有效的遮挡体
  state.occluders.clear();
  const next: Occluder[] = [];
  for (const item of state.items) {
    const occluder = item.occluder;
    if (occluder) {
      next.push(occluder);
      state.occluders.set(occluder.key, occluder);
    }
  }
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      if (i === j) { continue; }
      const occluder = next[i];
      const other = next[j];
      for (const k of [0, 1]) {
        if (occluder.diffraction[k]) {
          occluder.diffraction[k] = isPointOnSegment(occluder.seg[k], other.seg)
        }
      }
    }
  }
}
