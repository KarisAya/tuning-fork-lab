// 二维几何：射线 / 线段 / 圆的求交与镜像。全部为纯函数。

import { clamp } from './math';
import type { Point, Segment } from './types';

/** 射线 (ox,oy) + u 与线段的交点；t 为沿射线的距离参数。 */
export function rayHitSegment(
  ox: number, oy: number, ux: number, uy: number,
  ax: number, ay: number, bx: number, by: number,
): { t: number; u: number; x: number; y: number } | null {
  const rx = bx - ax;
  const ry = by - ay;
  const den = ux * ry - uy * rx;
  if (Math.abs(den) < 1e-9) return null;
  const wx = ax - ox;
  const wy = ay - oy;
  const u = (wx * uy - wy * ux) / den;
  const t = (wx * ry - wy * rx) / den;
  if (t <= 1e-6 || u < -1e-6 || u > 1 + 1e-6) {
    return null;
  }
  return { t, u, x: ox + ux * t, y: oy + uy * t };
}

/** 点关于线段所在直线的镜像点。 */
export function reflectPointAcrossLine(px: number, py: number, seg: Segment): Point {
  const [ax, ay, bx, by] = seg;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [px, py];
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return [2 * qx - px, 2 * qy - py];
}

export function pointSegmentDistanceSquared(px: number, py: number, seg: Segment): number {
  const [ax, ay, bx, by] = seg;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  const ex = px - qx;
  const ey = py - qy;
  return ex * ex + ey * ey;
}

/** 圆与线段的交点（0 ~ 2 个）。 */
export function circleSegmentIntersections(cx: number, cy: number, radius: number, seg: Segment): Point[] {
  const [ax, ay, bx, by] = seg;
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const A = dx * dx + dy * dy;
  if (A < 1e-9) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < -1e-8) return [];
  const sqrtD = Math.sqrt(Math.max(0, discriminant));
  const t1 = (-B - sqrtD) / (2 * A);
  const t2 = (-B + sqrtD) / (2 * A);
  const out: Point[] = [];
  if (t1 >= -1e-6 && t1 <= 1 + 1e-6) {
    const t = clamp(t1, 0, 1);
    out.push([ax + dx * t, ay + dy * t]);
  }
  if (Math.abs(t2 - t1) > 1e-7 && t2 >= -1e-6 && t2 <= 1 + 1e-6) {
    const t = clamp(t2, 0, 1);
    out.push([ax + dx * t, ay + dy * t]);
  }
  return out;
}
