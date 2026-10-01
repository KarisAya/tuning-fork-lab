// 波的可见性 / 路径几何：直接波遮挡、反射展开路径、衍射包络。
// 只依赖遮挡体快照，不依赖任何具体工具类。

import { DIFF_DECAY, DIFF_EDGE_POWER, GRID, TAU, SHADOW_SOFTNESS } from '../core/constants';
import { rayHitSegment, reflectPointAcrossLine } from '../core/geometry';
import { clamp, smoothstep } from '../core/math';
import type { Occluder, Point, Wave, WaveObstacle } from '../core/types';
import { state } from '../state';
import { getOccluder } from './occluders';

/** 起点到终点之间是否被任何板子挡住（ignore 中的板忽略）。 */
export function segmentBlockedByBoards(
  start: Point,
  end: Point,
  ignore: Set<WaveObstacle> = new Set(),
): boolean {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const ux = dx / len;
  const uy = dy / len;
  for (const o of state.occluders) {
    if (ignore.has(o.item)) continue;
    const hit = rayHitSegment(start[0], start[1], ux, uy, ...o.seg);
    if (!hit) continue;
    if (hit.t > 1e-3 && hit.t < len - 1e-3) {
      return true;
    }
  }
  return false;
}

/**
 * 反射波路径。
 *
 * 对直接波：source -> target。
 * 对反射波：使用展开法反解每一处实际反射点。
 */
const EMPTY_IGNORE: Set<WaveObstacle> = new Set();
export function getWavePathToPoint(
  wave: Wave,
  target: Point,
  finalIgnore?: WaveObstacle,
): Point[] | null {
  const virtualDistance = Math.hypot(target[0] - wave.x, target[1] - wave.y);
  if (wave.reflections.length > 0 && virtualDistance + 1e-3 < wave.birthR) {
    return null;
  }
  if (wave.reflections.length === 0) {
    const source: Point = [wave.sourceX, wave.sourceY];
    let ignore;
    if (finalIgnore) {
      ignore = new Set<WaveObstacle>();
      ignore.add(finalIgnore);
    } else { ignore = EMPTY_IGNORE; }
    if (segmentBlockedByBoards(source, target, ignore)) { return null; }
    return [source, target];
  }
  let currentSource: Point = [wave.x, wave.y];
  let currentTarget: Point = [target[0], target[1]];
  const reverseBounces: Point[] = [];
  for (let i = wave.reflections.length - 1; i >= 0; i -= 1) {
    const hop = wave.reflections[i];
    const board = getOccluder(hop.item);
    if (!board) return null;
    const dx = currentTarget[0] - currentSource[0];
    const dy = currentTarget[1] - currentSource[1];
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-6) return null;
    const hit = rayHitSegment(
      currentSource[0], currentSource[1], dx / distance, dy / distance, ...board.seg,
    );
    if (!hit || hit.t > distance + 1e-3) {
      return null;
    }
    reverseBounces.push([hit.x, hit.y]);
    currentSource = reflectPointAcrossLine(currentSource[0], currentSource[1], board.seg);
    currentTarget = reflectPointAcrossLine(currentTarget[0], currentTarget[1], board.seg);
  }
  const bounces = reverseBounces.reverse();
  const source: Point = [wave.sourceX, wave.sourceY];
  const path: Point[] = [source, ...bounces, target];
  for (let i = 0; i < path.length - 1; i += 1) {
    const ignore = new Set<WaveObstacle>();
    if (i === 0) {
      ignore.add(wave.reflections[0].item);
    }
    if (i > 0 && i - 1 < wave.reflections.length) {
      ignore.add(wave.reflections[i - 1].item);
    }
    if (i < wave.reflections.length) {
      ignore.add(wave.reflections[i].item);
    }
    if (i === path.length - 2 && finalIgnore) {
      ignore.add(finalIgnore);
    }
    if (segmentBlockedByBoards(path[i], path[i + 1], ignore)) {
      return null;
    }
  }
  return path;
}



/**
 * 衍射包络：掠射 + 阴影填充 + 路径衰减 + 缝隙权重。
 */
export function diffractionEnvelope(
  o: Occluder,
  edge: Point,
  source: Point,
  target: Point,
  rr: number,
): number {
  const incomingX = source[0] - edge[0];
  const incomingY = source[1] - edge[1];
  const incomingLen = Math.hypot(incomingX, incomingY) || 1;
  const outgoingX = target[0] - edge[0];
  const outgoingY = target[1] - edge[1];
  const outgoingLen = Math.hypot(outgoingX, outgoingY) || 1;
  const cosTurn = clamp(
    (incomingX * outgoingX + incomingY * outgoingY) / (incomingLen * outgoingLen), -1, 1,
  );
  const turn = Math.acos(cosTurn);
  const grazing = Math.pow(Math.max(0, Math.sin(turn)), 0.55);
  const shadowFill = Math.pow(clamp((1 - cosTurn) * 0.5, 0, 1), DIFF_EDGE_POWER);
  const angularGain = clamp(0.15 + 0.85 * Math.max(grazing, shadowFill), 0, 1);
  const pathAttenuation = 1 / Math.sqrt(1 + rr / DIFF_DECAY);
  const edgeDistanceAttenuation = 1 / Math.sqrt(1 + incomingLen / (GRID * 3.5));
  const edgeIndex = o.ends.indexOf(edge);
  const edgeWeight = 0.65 + 0.35 * clamp((o.gains[edgeIndex] ?? 1) - 1, 0, 1);
  return clamp(angularGain * pathAttenuation * edgeDistanceAttenuation * edgeWeight, 0, 1);
}

/** 次级波（衍射）的入射方向：路径的倒数第二个点。 */
export function getIncidentSource(wave: Wave, path: Point[]): Point {
  if (path.length >= 2) {
    const p = path[path.length - 2];
    return [p[0], p[1]];
  }
  return [wave.sourceX, wave.sourceY];
}

/**
 * 波的可见度系统。
 *
 * 用软边过渡代替硬遮罩，因此波前穿过板子时不会因为帧间半径变化而产生硬闪。
 * 同时仍然遵守真实几何：板子后方不会永久恢复成直达波。
 */
/** 点到线段最短距离的平方 */
function pointSegDistSq(
  px: number, py: number,
  x0: number, y0: number,
  x1: number, y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const ex = px - (x0 + t * dx);
  const ey = py - (y0 + t * dy);
  return ex * ex + ey * ey;
}

/** 归一化到 [0, TAU) */
function normAngle(a: number): number {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

interface OccluderCache {
  item: unknown;
  x0: number; y0: number; x1: number; y1: number;
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

  for (const o of state.occluders) {
    // 衍射波的母板只负责定义边缘，不作为自己的遮挡体。
    if (wave.diffraction?.board === o.item) continue;

    const [x0, y0, x1, y1] = o.seg;

    // 径向剪枝
    const dMinSq = pointSegDistSq(wave.x, wave.y, x0, y0, x1, y1);
    if (dMinSq >= reachSq) continue;

    // 角弧剪枝：取两端点视向角之间的"短弧"
    let a0 = normAngle(Math.atan2(y0 - wave.y, x0 - wave.x));
    const a1 = normAngle(Math.atan2(y1 - wave.y, x1 - wave.x));
    let span = a1 - a0;
    if (span < 0) span += TAU;
    if (span > Math.PI) {
      // 反向弧才是线段覆盖的短弧
      a0 = a1;
      span = TAU - span;
    }

    cache.push({ item: o.item, x0, y0, x1, y1, a0, span });
  }
  return cache;
}

/**
 * 波的可见度系统（已做径向 + 角区间剪枝）。
 * 语义与原来完全一致：软边过渡、衍射母板例外、深阴影直接 return 0。
 *
 * angle 必须与 ux/uy 对应，并且落在 [0, TAU)（采样循环里的 (i+0.5)*stepAngle 天然满足）。
 */
export function directVisibility(
  wave: Wave,
  ux: number,
  uy: number,
  angle: number,
  cache: OccluderCache[],
): number {
  let visibility = 1;

  for (let i = 0; i < cache.length; i += 1) {
    const c = cache[i];
    // 角区间剪枝：射线方向不在该板张成的角弧内，必定不命中
    let da = angle - c.a0;
    da %= TAU;
    if (da < 0) da += TAU;
    if (da > c.span) continue;
    const hit = rayHitSegment(wave.x, wave.y, ux, uy, c.x0, c.y0, c.x1, c.y1);
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

export function wavePathToPoint(wave: Wave, target: Point, finalIgnore?: WaveObstacle): boolean {
  return getWavePathToPoint(wave, target, finalIgnore) !== null;
}

export function reflectionVisibility(wave: Wave, target: Point): number {
  return wavePathToPoint(wave, target) ? 1 : 0;
}
