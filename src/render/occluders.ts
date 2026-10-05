// 遮挡体采集：把「能挡波的工具」折算成波计算用的线段快照。

import { GRID } from '../core/constants';
import type { Point, Segment, UniSeg } from '../core/types';
import { distanceSquarePointSegment } from '../core/math';
import { state } from '../core/state';

export const HALF_GRID_SQ = GRID * GRID / 4;
export function isPointOnSegment(p: Point, seg: Segment) {
  return distanceSquarePointSegment(p, seg) > HALF_GRID_SQ
}

export function collectOccluders(): void {
  console.log('Collecting occluders...');
  state.occluders.clear();
  state.occStale = false;
  const olist: [UniSeg, number, number][] = [];
  for (const item of state.items) {
    const occluder = item.occluder;
    if (!occluder) { continue; }
    const [[ax, ay], [bx, by]] = occluder[1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) { continue; }
    olist.push([occluder, -dy / len, dx / len]);
  }
  if (olist.length === 0) { return; }
  for (let i = 0; i < olist.length; i++) {
    const [[key, seg, reflect], nx, ny] = olist[i];
    const diffraction = [true, true] as [boolean, boolean];
    for (let j = 0; j < olist.length; j++) {
      if (i === j) { continue; }
      const other = olist[j][0][1];
      diffraction[0] = diffraction[0] && isPointOnSegment(seg[0], other);
      diffraction[1] = diffraction[1] && isPointOnSegment(seg[1], other);
      if (!diffraction[0] && !diffraction[1]) { break; }
    }
    state.occluders.set(key, { key, diffraction, reflect, seg, nx, ny })
  }
}
