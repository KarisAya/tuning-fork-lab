// 遮挡体采集：把「能挡波的工具」折算成波计算用的线段快照。

import { DIFF_GAP_RANGE } from '../core/constants';
import { clamp } from '../core/math';
import type { Occluder, Point, WaveObstacle } from '../core/types';
import { state } from '../state';

export function collectOccluders(): void {
  const next: Occluder[] = [];
  for (const item of state.items) {
    if (item.removed || item.dragging || !item.occludesWaves) {
      continue;
    }
    const seg = item.occluderSegment();
    if (!seg) continue;
    const [ax, ay, bx, by] = seg;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ends: Point[] = [[ax, ay], [bx, by]];
    next.push({
      item,
      seg,
      reflect: item.reflectsWaves,
      key: item.occluderKey(),
      ends,
      nx: -dy / len,
      ny: dx / len,
      gains: [1, 1],
    });
  }
  // 缝隙增益：端点离其他端点越近，衍射越强。
  const allEnds = next.flatMap((o) => o.ends);
  for (const o of next) {
    o.gains = o.ends.map((edge) => {
      let nearest = Infinity;
      for (const other of allEnds) {
        if (other === edge) continue;
        nearest = Math.min(nearest, Math.hypot(other[0] - edge[0], other[1] - edge[1]));
      }
      if (!Number.isFinite(nearest)) return 1;
      const slit = 1 - clamp(nearest / DIFF_GAP_RANGE, 0, 1);
      return 1 + slit * 1.2;
    });
  }
  state.occluders = next;
}

export function getOccluder(item: WaveObstacle): Occluder | null {
  return state.occluders.find((o) => o.item === item) ?? null;
}
