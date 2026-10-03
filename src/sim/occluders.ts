// 遮挡体采集：把「能挡波的工具」折算成波计算用的线段快照。

import { GRID } from '../core/constants';
import type { Point, Segment, UniSeg } from '../core/types';
import { distanceSquarePointSegment } from '../core/math';
import { state } from '../state';

export const HALF_GRID_SQ = GRID * GRID / 4;
export function isPointOnSegment(p: Point, seg: Segment) {
  return distanceSquarePointSegment(p, seg) > HALF_GRID_SQ
}

export function collectOccluders(): void {
  if (state.occluders.size !== 0) { return; }
  console.log('Collecting occluders...');
  const seglist: UniSeg[] = [];
  for (const item of state.items) {
    const occluder = item.occluder;
    if (occluder) {
      seglist.push(occluder);
    };
  }
  for (let i = 0; i < seglist.length; i++) {
    const [key, seg, reflect] = seglist[i];
    const diffraction = [true, true] as [boolean, boolean];
    for (let j = 0; j < seglist.length; j++) {
      if (i === j) { continue; }
      const other = seglist[j][1];
      diffraction[0] = diffraction[0] && !isPointOnSegment(seg[0], other);
      diffraction[1] = diffraction[1] && !isPointOnSegment(seg[1], other);
      if (!diffraction[0] && !diffraction[1]) { break; }
    }
    state.occluders.set(key, { key, diffraction, reflect, seg })
  }
}
