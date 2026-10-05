// 波的可见性 / 路径几何：直接波遮挡、反射展开路径、衍射包络。
// 只依赖遮挡体快照，不依赖任何具体工具类。

import { DIFF_DECAY, DIFF_EDGE_POWER, GRID, TAU, HALF_PI, SHADOW_SOFTNESS } from '../core/constants';
import type { Point, Occluder, Wave } from '../core/types';
import { clamp, smoothstep, distanceSquarePointSegment, rayHitSegment, reflectPointAcrossLine } from '../core/math';
import { state } from '../core/state';

/** 起点到终点之间是否被任何板子挡住（ignore 中的板忽略）。 */
export function segmentBlockedByBoards(start: Point, end: Point, ignore: Set<string>,): boolean {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return false;
  const len = Math.sqrt(lenSq);
  const ux = dx / len;
  const uy = dy / len;
  const tMax = len - 1e-3;
  const occluders = state.occluders;
  for (const [k, o] of occluders) {
    if (ignore.has(k)) continue;
    const hit = rayHitSegment(start, ux, uy, o.seg);
    if (!hit) continue;
    if (hit.t > 1e-3 && hit.t < tMax) return true;
  }
  return false;
}

/**
 * 反射波路径。
 *
 * 对直接波：source -> target。
 * 对反射波：使用展开法反解每一处实际反射点。
 */
const EMPTY_IGNORE: Set<string> = new Set();
export function getWavePathToPoint(wave: Wave, target: Point, finalIgnore?: string): Point[] | null {
  const source = wave.source;
  if (wave.reflections.length === 0) {
    let ignore;
    if (finalIgnore) { ignore = new Set<string>(); ignore.add(finalIgnore); }
    else { ignore = EMPTY_IGNORE; }
    if (segmentBlockedByBoards(source, target, ignore)) { return null; }
    return [source, target];
  }
  const position = wave.position;
  const [targetX, targetY] = target;
  const dx = targetX - position[0];
  const dy = targetY - position[1];
  const virtualDistSq = dx * dx + dy * dy;
  if (virtualDistSq + 1e-3 < wave.birthR * wave.birthR) { return null; }
  let currentSource: Point = position
  let currentTarget: Point = target
  const reverseBounces: Point[] = [];
  for (let i = wave.reflections.length - 1; i >= 0; i -= 1) {
    const board = wave.reflections[i].occ
    const dx = currentTarget[0] - currentSource[0];
    const dy = currentTarget[1] - currentSource[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-6) return null;
    const hit = rayHitSegment(currentSource, dx / distance, dy / distance, board.seg,);
    if (!hit || hit.t > distance + 1e-3) { return null; }
    reverseBounces.push([hit.x, hit.y]);
    currentSource = reflectPointAcrossLine(currentSource, board.seg);
    currentTarget = reflectPointAcrossLine(currentTarget, board.seg);
  }
  const bounces = reverseBounces.reverse();
  const path: Point[] = [source, ...bounces, target];
  for (let i = 0; i < path.length - 1; i += 1) {
    const ignore = new Set<string>();
    if (i === 0) { ignore.add(wave.reflections[0].occ.key); }
    if (i > 0 && i - 1 < wave.reflections.length) { ignore.add(wave.reflections[i - 1].occ.key); }
    if (i < wave.reflections.length) { ignore.add(wave.reflections[i].occ.key); }
    if (i === path.length - 2 && finalIgnore) { ignore.add(finalIgnore); }
    if (segmentBlockedByBoards(path[i], path[i + 1], ignore)) { return null; }
  }
  return path;
}
/**
 * 衍射包络：掠射 + 阴影填充 + 路径衰减 + 缝隙权重。
 */

/**
 * 衍射包络的位置项：路径衰减 × 边缘距离衰减 × 边缘权重。
 * 同一波的一圈采样里是常量，可在循环外预计算。
 */
export function diffractionPositionFactor(beL: number, r: number): number {
  // const edge = o.seg[edgeIndex];
  // const inX = source[0] - edge[0];
  // const inY = source[1] - edge[1];
  // const inLen = Math.sqrt(inX * inX + inY * inY) || 1;
  const pathAttenuation = 1 / Math.sqrt(1 + r / DIFF_DECAY);
  const edgeDistanceAttenuation = 1 / Math.sqrt(1 + beL / (GRID * 3.5));
  return pathAttenuation * edgeDistanceAttenuation;
}

/**
 * 衍射包络的角度项：只跟入射方向与出射方向夹角有关。
 *
 * inUx/inUy 是从 edge 指向 source 的【单位】向量（调用方预计算）。
 *   turn <  π/2：反射侧，用掠射峰 sin(turn)^0.55
 *   turn >= π/2：阴影侧，随深度单调衰减（原来 shadowFill 反向填充导致一圈无差别）
 */
export function diffractionAngleFactor(
  edge: Point,
  inUx: number,
  inUy: number,
  target: Point,
): number {
  const outX = target[0] - edge[0];
  const outY = target[1] - edge[1];
  const outLen = Math.sqrt(outX * outX + outY * outY) || 1;

  const cosTurn = clamp((inUx * outX + inUy * outY) / outLen, -1, 1);

  if (cosTurn > 0) {
    // turn < π/2：反射侧，sin(turn) = sqrt(1 - cos²) 恒非负
    const sinTurn = Math.sqrt(Math.max(0, 1 - cosTurn * cosTurn));
    return Math.pow(sinTurn, 0.55);
  }

  // turn ≥ π/2：阴影侧，[π/2, π] → [0, 1] 单调
  const turn = Math.acos(cosTurn);
  const shadowT = (turn - HALF_PI) / HALF_PI;
  return Math.pow(1 - shadowT, DIFF_EDGE_POWER);
}

/** 次级波（衍射）的入射方向：路径的倒数第二个点。 */
export function getIncidentSource(wave: Wave, path: Point[]): Point {
  if (path.length >= 2) {
    const p = path[path.length - 2];
    return [p[0], p[1]];
  }
  return wave.source;
}

/**
 * 波的可见度系统。
 *
 * 用软边过渡代替硬遮罩，因此波前穿过板子时不会因为帧间半径变化而产生硬闪。
 * 同时仍然遵守真实几何：板子后方不会永久恢复成直达波。
 */

/** 归一化到 [0, TAU) */
function normAngle(a: number): number {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

interface OccluderCache {
  o: Occluder;
  a0: number;    // 角弧起点，[0, TAU)
  span: number;  // 逆时针覆盖弧长，落在 (0, PI]
}

/**
 * 每帧每波构建一次。做两件事：
 *   1. 径向剪枝：波源到线段最短距离 + 软边都够不着波前 → 丢掉；
 *   2. 角区间剪枝：预计算线段相对波源张成的角弧，供采样时 O(1) 排除。
 */
export function buildOccluderCache(wave: Wave): OccluderCache[] {
  const cache: OccluderCache[] = [];
  const reach = wave.r + SHADOW_SOFTNESS;
  const reachSq = reach * reach;
  const [x, y] = wave.position;
  for (const o of state.occluders.values()) {
    // 衍射波的母板只负责定义边缘，不作为自己的遮挡体。
    if (wave.diffractionInfo?.board === o) continue;
    const [[x0, y0], [x1, y1]] = o.seg;
    // 径向剪枝
    const dMinSq = distanceSquarePointSegment(wave.position, o.seg);
    if (dMinSq >= reachSq) continue;
    // 角弧剪枝：取两端点视向角之间的"短弧"
    let a0 = normAngle(Math.atan2(y0 - y, x0 - x));
    const a1 = normAngle(Math.atan2(y1 - y, x1 - x));
    let span = a1 - a0;
    if (span < 0) span += TAU;
    if (span > Math.PI) {
      // 反向弧才是线段覆盖的短弧
      a0 = a1;
      span = TAU - span;
    }
    cache.push({ o, a0, span });
  }
  return cache;
}

/**
 * 波的可见度系统（已做径向 + 角区间剪枝）。
 * 语义与原来完全一致：软边过渡、衍射母板例外、深阴影直接 return 0。
 *
 * angle 必须与 ux/uy 对应，并且落在 [0, TAU)（采样循环里的 (i+0.5)*stepAngle 天然满足）。
 */
export function directVisibility(wave: Wave, ux: number, uy: number, angle: number, cache: OccluderCache[]): number {
  let visibility = 1;
  for (const { o, a0, span } of cache) {
    let da = angle - a0;
    da %= TAU;
    if (da < 0) da += TAU;
    if (da > span) continue;
    const hit = rayHitSegment(wave.position, ux, uy, o.seg);
    if (!hit) continue;
    const delta = hit.t - wave.r;
    if (delta >= SHADOW_SOFTNESS) continue;         // 板还没被波前触及
    if (delta <= -SHADOW_SOFTNESS) return 0;        // 已深入阴影
    const local = smoothstep(-SHADOW_SOFTNESS, SHADOW_SOFTNESS, delta);
    if (local < visibility) visibility = local;
    if (visibility <= 0.001) return 0;
  }
  return visibility;
}
