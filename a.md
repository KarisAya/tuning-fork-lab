updateWaves(dt);
renderWaves();
这两个函数会在同一帧调用
会渲染波的扩散和反射，衍射
但是现在模拟完全没有正常工作

请帮我找出问题。

在介绍函数之前，我先向你展示一些主要的类型定义以便你分析问题。

```ts
export type Point = [number, number];
export type Segment = [Point, Point];
export interface ReflectionHop {
  occ: Occluder;
  seg: Segment;
  bounce: Point;
}

export interface DiffractionInfo {
  board: Occluder;
  edgeIndex: number;
  edge: Point;
  incidentSource: Point;
}

export interface Wave {
  position: Point;
  r: number;
  hue: number;
  freq: number;
  travelDistance: number;
  source: Point;
  reflections: ReflectionHop[];
  birthR: number;
  diffraction: DiffractionInfo | null;
  diffractionDepth: number;
  /** 低于二级波计算阈值后，停止反射/衍射，并进入平滑淡出。 */
  fadeOut: number;
  skipTag: boolean;
  /** 仅用于分支去重；不再作为主波渲染的硬遮罩。 */
  emittedReflections: Set<string>;
  emittedDiffractions: Set<string>;
}

/** 采集得到的遮挡体快照（模拟层内部使用）。 */
export interface Occluder {
  diffraction: [boolean, boolean];
  reflect: boolean;
  seg: Segment;
  key: string;
}
```

下面是入口

```ts
export function updateWaves(dt: number): void {
  if (!state.waves.length) return;
  collectOccluders();
  for (let i = state.waves.length - 1; i >= 0; i -= 1) {
    const wave = state.waves[i];
    wave.r += state.waveSpeed * dt;
    // 一旦波弱到不值得继续做反射/衍射计算，立即停止二级波生成，
    // 但不要立即删除。保留一个短暂的淡出阶段，让动画连续。
    if (wave.travelDistance + wave.r > MAX_TRAVEL_DISTANCE) {
      wave.fadeOut = Math.max(0, wave.fadeOut - dt / WAVE_FADE_DURATION);
      if (wave.fadeOut < MIN_WAVE_EFFECTIVE_ALPHA) {
        state.waves.splice(i, 1);
        continue;
      }
    } else {
      wave.fadeOut = 1;
    }
    if (wave.skipTag) continue;
    const waveCount = state.waves.length;
    if (waveCount > WAVE_COUNT_THROTTLE_STRICT) {
      if (i % Math.ceil(waveCount / WAVE_COUNT_THROTTLE_STRICT)) {
        continue;
      } else {
        spawnSecondaryWaves(wave, pushSkipWave);
      }
    } else if (waveCount > WAVE_COUNT_THROTTLE_START && i % Math.ceil(waveCount / WAVE_COUNT_THROTTLE_START)) {
      spawnSecondaryWaves(wave, pushSkipWave);
    } else {
      spawnSecondaryWaves(wave);
    }
  }
  return;
}
```

首先这个函数应该没什么问题，内部调用了 `collectOccluders` 和 `spawnSecondaryWaves`
这两个函数都很重要，但是我认为 `collectOccluders` 应该不太会出问题（但是也有可能）， `spawnSecondaryWaves` 比较复杂。

但是 collectOccluders 做了对 spawnSecondaryWaves 很重要的处理，所以我会展示这两个函数

```ts
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
    for (let j = 0; j < next.length; j++) {
      if (i === j) {
        continue;
      }
      const occluder = next[i];
      const other = next[j];
      for (const k of [0, 1]) {
        if (occluder.diffraction[k]) {
          occluder.diffraction[k] = isPointOnSegment(occluder.seg[k], other.seg);
        }
      }
    }
  }
}

function spawnSecondaryWaves(wave: Wave, push = pushWave): void {
  // if (wave.reflections.length > MAX_REFLECTION_DEPTH) return;
  // if (wave.diffractionDepth > MAX_DIFFRACTION_DEPTH) return;
  // -------------------------
  // 反射
  // -------------------------
  for (const [k, o] of state.occluders) {
    if (!o.reflect) {
      continue;
    }
    if (wave.emittedReflections.has(k)) {
      continue;
    }
    if (wave.diffraction?.board.key === k) {
      continue;
    }
    if (wave.r * wave.r < distanceSquarePointSegment(wave.position, o.seg) - 1e-3) {
      continue;
    }
    const hits = circleSegmentIntersections(wave.position, wave.r, o.seg);
    for (const hit of hits) {
      const path = getWavePathToPoint(wave, hit, k);
      if (!path) continue;
      const bounce = path[path.length - 1];
      const reflected = createReflectedWave(wave, o, bounce);
      if (reflected) {
        push(reflected);
        wave.emittedReflections.add(k);
        break;
      }
    }
  }
  // -------------------------
  // 衍射
  // -------------------------
  const lastReflection = wave.reflections[wave.reflections.length - 1];
  const [sx, sy] = wave.position;
  const rSq = wave.r * wave.r;
  for (const [k, o] of state.occluders) {
    if (wave.diffraction?.board === o) {
      continue;
    }
    if (lastReflection?.occ === o) {
      continue;
    }
    for (const i of [0, 1]) {
      if (!o.diffraction[i]) {
        continue;
      }
      const key = `${k}:${i}`;
      if (wave.emittedDiffractions.has(key)) {
        continue;
      }
      const [x, y] = o.seg[i];
      const dx = x - sx;
      const dy = y - sy;
      if (rSq < dx * dx + dy * dy - 1e-3) {
        continue;
      }
      const path = getWavePathToPoint(wave, o.seg[i], k);
      if (!path) continue;
      const incidentSource = getIncidentSource(wave, path);
      const child = createDiffractionWave(wave, o, i, incidentSource);
      if (!child) continue;
      wave.emittedDiffractions.add(key);
      push(child);
    }
  }
}
```

spawnSecondaryWaves 里面包含大量计算，还有很多手动优化，所以都有可能出问题
我会把主要的函数全部放在这里

```ts
export function makeWave(source: Point, freq: number, radius = 0, travelDistance = 0): Wave {
  return {
    position: [...source],
    r: radius,
    hue: freqHue(freq),
    freq,
    travelDistance,
    source: [...source],
    reflections: [],
    birthR: 0,
    diffraction: null,
    diffractionDepth: 0,
    fadeOut: 1,
    skipTag: false,
    emittedReflections: new Set(),
    emittedDiffractions: new Set(),
  };
}

export function pushWave(wave: Wave): void {
  state.waves.push(wave);
}
function pushSkipWave(wave: Wave): void {
  wave.skipTag = true;
  state.waves.push(wave);
}

/**
 * 反射波路径。
 *
 * 对直接波：source -> target。
 * 对反射波：使用展开法反解每一处实际反射点。
 */
const EMPTY_IGNORE: Set<string> = new Set();
export function getWavePathToPoint(wave: Wave, target: Point, finalIgnore?: string): Point[] | null {
  if (wave.reflections.length === 0) {
    const source = wave.source;
    let ignore;
    if (finalIgnore) {
      ignore = new Set<string>();
      ignore.add(finalIgnore);
    } else {
      ignore = EMPTY_IGNORE;
    }
    if (segmentBlockedByBoards(source, target, ignore)) {
      return null;
    }
    return [source, target];
  }
  const [sourceX, sourceY] = wave.source;
  const [targetX, targetY] = target;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const virtualDistSq = dx * dx + dy * dy;
  if (virtualDistSq + 1e-3 < wave.birthR * wave.birthR) {
    return null;
  }
  let currentSource: Point = [...wave.position];
  let currentTarget: Point = [...target];
  const reverseBounces: Point[] = [];
  for (let i = wave.reflections.length - 1; i >= 0; i -= 1) {
    const board = wave.reflections[i].occ;
    if (!board) return null;
    const dx = currentTarget[0] - currentSource[0];
    const dy = currentTarget[1] - currentSource[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-6) return null;
    const hit = rayHitSegment(currentSource, dx / distance, dy / distance, board.seg);
    if (!hit || hit.t > distance + 1e-3) {
      return null;
    }
    reverseBounces.push([hit.x, hit.y]);
    currentSource = reflectPointAcrossLine(currentSource, board.seg);
    currentTarget = reflectPointAcrossLine(currentTarget, board.seg);
  }
  const bounces = reverseBounces.reverse();
  const source: Point = [sourceX, sourceY];
  const path: Point[] = [source, ...bounces, target];
  for (let i = 0; i < path.length - 1; i += 1) {
    const ignore = new Set<string>();
    if (i === 0) {
      ignore.add(wave.reflections[0].occ.key);
    }
    if (i > 0 && i - 1 < wave.reflections.length) {
      ignore.add(wave.reflections[i - 1].occ.key);
    }
    if (i < wave.reflections.length) {
      ignore.add(wave.reflections[i].occ.key);
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

/** 由一次命中生成反射子波：镜像发射点 + 展开路径。 */
function createReflectedWave(parent: Wave, o: Occluder, bounce: Point): Wave | null {
  if (!o.reflect) {
    return null;
  }
  if (parent.reflections.some((hop) => hop.occ === o)) {
    return null;
  }
  const nextTravelDistance = parent.travelDistance + parent.r;
  const position = reflectPointAcrossLine(parent.position, o.seg);
  const next = makeWave(position, parent.freq, parent.r, nextTravelDistance);
  next.hue = parent.hue;
  next.source = [...parent.source];
  next.reflections = [...parent.reflections, { occ: o, seg: [...o.seg] as Segment, bounce: [bounce[0], bounce[1]] }];
  next.birthR = parent.r;
  next.diffraction = null;
  next.diffractionDepth = parent.diffractionDepth;
  return next;
}

/** 次级波（衍射）的入射方向：路径的倒数第二个点。 */
export function getIncidentSource(wave: Wave, path: Point[]): Point {
  if (path.length >= 2) {
    const p = path[path.length - 2];
    return [p[0], p[1]];
  }
  return [...wave.source];
}

/** 由一条边生成衍射子波：以边缘为新的点源。 */
function createDiffractionWave(parent: Wave, o: Occluder, edgeIndex: number, incidentSource: Point): Wave | null {
  const edge = o.seg[edgeIndex];
  const nextTravelDistance = parent.travelDistance + parent.r;
  const next = makeWave(edge, parent.freq, 0, nextTravelDistance);
  next.hue = parent.hue;
  next.source = [...edge];
  next.reflections = [];
  next.birthR = 0;
  next.diffraction = { board: o, edgeIndex, edge: [edge[0], edge[1]], incidentSource: [incidentSource[0], incidentSource[1]] };
  next.diffractionDepth = parent.diffractionDepth + 1;
  return next;
}
```

接下来是渲染部分的函数，这些函数出问题的可能也比较大

```ts
// 波的绘制：直接波用软边可见度，二级波用几何路径采样。
import { RENDER_SAMPLES, SECONDARY_RENDER_SAMPLES, TAU, WAVE_LW, WAVE_REMOVE_ALPHA } from "../core/constants";
import type { Point, Wave } from "../core/types";
import {
  diffractionPositionFactor,
  diffractionAngleFactor,
  buildOccluderCache,
  directVisibility,
  getWavePathToPoint,
  segmentBlockedByBoards,
} from "../sim/optics";
import { renderWaveAlpha } from "../sim/waves";
import { state } from "../state";
import { waveCtx } from "../ui/dom";

// ---------------------------------------------------------------------------
// 常量 / 缓存
// ---------------------------------------------------------------------------

const ALPHA_STEP = 0.04;
const ALPHA_INV = 1 / ALPHA_STEP;
/** 目标弧段长度（像素），决定采样密度。 */
const MIN_SEG_PX = 3;
/** 每个波最少采样数，避免小半径出现明显折线。 */
const MIN_SAMPLES = 64;

// sin/cos 查表（固定分辨率，支持负角度回绕）
const TRIG_BITS = 12;
const TRIG_SIZE = 1 << TRIG_BITS;
const TRIG_MASK = TRIG_SIZE - 1;
const TRIG_SCALE = TRIG_SIZE / TAU;
const SIN_TABLE = new Float32Array(TRIG_SIZE);
const COS_TABLE = new Float32Array(TRIG_SIZE);
for (let i = 0; i < TRIG_SIZE; i += 1) {
  const a = (i / TRIG_SIZE) * TAU;
  SIN_TABLE[i] = Math.sin(a);
  COS_TABLE[i] = Math.cos(a);
}

function fastSin(angle: number): number {
  return SIN_TABLE[((angle * TRIG_SCALE) | 0) & TRIG_MASK];
}
function fastCos(angle: number): number {
  return COS_TABLE[((angle * TRIG_SCALE) | 0) & TRIG_MASK];
}

// 颜色字符串缓存：key = hue|sat|light|quantizedAlpha
const colorCache = new Map<string, string>();
function getStrokeColor(hue: string, sat: number, light: number, alpha: number): string {
  const key = `${hue}|${sat}|${light}|${alpha}`;
  let c = colorCache.get(key);
  if (c === undefined) {
    c = `hsla(${hue},${sat}%,${light}%,${alpha.toFixed(3)})`;
    colorCache.set(key, c);
  }
  return c;
}

// 复用衍射波的忽略集合，避免每帧 new Set
const tmpIgnore = new Set<string>();

interface ArcRun {
  a0: number;
  a1: number;
  alpha: number;
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/**
 * 判断圆环（半径 r 的圆周）是否与视口矩形相交。
 *
 * - 若整个圆盘都在视口外 → 不画。
 * - 若整个矩形都落在圆盘内部 → 圆周也在视口外 → 不画。
 * - 其余情况保留。
 */
function circleRingIntersectsViewport(c: Point, r: number, w: number, h: number): boolean {
  const [cx, cy] = c;
  // 圆心到视口矩形的最近点距离平方
  const nx = cx < 0 ? 0 : cx > w ? w : cx;
  const ny = cy < 0 ? 0 : cy > h ? h : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  const dmin2 = dx * dx + dy * dy;

  // 圆心到四个角点的最大距离平方
  let dmax2 = 0;
  for (let i = 0; i < 4; i += 1) {
    const x = (i & 1) === 0 ? 0 : w;
    const y = (i & 2) === 0 ? 0 : h;
    const ex = cx - x;
    const ey = cy - y;
    const d2 = ex * ex + ey * ey;
    if (d2 > dmax2) dmax2 = d2;
  }

  const r2 = r * r;
  return r2 >= dmin2 && r2 <= dmax2;
}

/**
 * 采样数按弧长自适应。
 * 小半径不再强制 256 次采样，大半径也不会低于视觉可分辨密度。
 */
function sampleCountForRadius(r: number, maxSamples: number): number {
  const arcLen = TAU * r;
  const byArc = Math.ceil(arcLen / MIN_SEG_PX);
  if (byArc < MIN_SAMPLES) return MIN_SAMPLES;
  if (byArc > maxSamples) return maxSamples;
  return byArc;
}

/**
 * 把连续同 alpha 的弧段合并后按颜色分组，一次 stroke 画完。
 *
 * 相比「每段 beginPath + arc + stroke」，可以把 Canvas 调用次数
 * 从 O(samples) 降到 O(不同颜色数)。因为 alpha 已经被量化到
 * ALPHA_STEP，通常只会产生很少几个颜色分组。
 */
function strokeArcRuns(c: Point, r: number, runs: ArcRun[], hue: string, sat: number, light: number): void {
  const [cx, cy] = c;
  if (runs.length === 0) return;
  const buckets = new Map<number, ArcRun[]>();
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    const key = Math.round(run.alpha * ALPHA_INV);
    let arr = buckets.get(key);
    if (arr === undefined) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(run);
  }

  for (const [key, arcs] of buckets) {
    const alpha = key * ALPHA_STEP;
    if (alpha < WAVE_REMOVE_ALPHA) continue;
    waveCtx.strokeStyle = getStrokeColor(hue, sat, light, alpha);
    waveCtx.beginPath();
    for (let i = 0; i < arcs.length; i += 1) {
      const arc = arcs[i];
      const c = fastCos(arc.a0);
      const s = fastSin(arc.a0);
      // 先 moveTo 到弧起点，避免 arc 从当前点拉一条直线过去
      waveCtx.moveTo(cx + c * r, cy + s * r);
      waveCtx.arc(cx, cy, r, arc.a0, arc.a1);
    }
    waveCtx.stroke();
  }
}

// ---------------------------------------------------------------------------
// 直接波
// ---------------------------------------------------------------------------

/**
 * 为了避免 Canvas 在每一个角度创建大量随机 alpha 状态，
 * 这里按「连续可见区间」合并采样。
 *
 * 每个小弧段根据 visibility 使用自己的 strokeStyle。
 * 当相邻采样颜色接近时会自动合并，因此视觉上仍然是一条
 * 连续的波，而不是点状虚线。
 */
function drawDirectWave(wave: Wave, baseAlpha: number): void {
  if (wave.r <= 0.5) return;

  const samples = sampleCountForRadius(wave.r, RENDER_SAMPLES);
  const hue = wave.hue.toFixed(1);
  const stepAngle = TAU / samples;

  const cache = buildOccluderCache(wave);
  const runs: ArcRun[] = [];
  let runStart = -1;
  let runAlpha = 0;

  const flush = (endAngle: number): void => {
    if (runStart < 0 || runAlpha < WAVE_REMOVE_ALPHA) {
      runStart = -1;
      runAlpha = 0;
      return;
    }
    runs.push({ a0: runStart, a1: endAngle, alpha: runAlpha });
    runStart = -1;
    runAlpha = 0;
  };

  for (let i = 0; i < samples; i += 1) {
    const angle = (i + 0.5) * stepAngle;
    const ux = fastCos(angle);
    const uy = fastSin(angle);
    const alpha = baseAlpha * directVisibility(wave, ux, uy, angle, cache);
    if (alpha < WAVE_REMOVE_ALPHA) {
      flush(i * stepAngle);
      continue;
    }
    const quantizedAlpha = Math.round(alpha * ALPHA_INV) * ALPHA_STEP;
    if (runStart < 0) {
      runStart = i * stepAngle;
      runAlpha = quantizedAlpha;
      continue;
    }

    // 只合并透明度接近的弧段。某个方向被隔音板遮挡时，
    // 不会把整个连续弧段压成同一个低透明度。
    if (Math.abs(quantizedAlpha - runAlpha) > ALPHA_STEP) {
      flush(i * stepAngle);
      runStart = i * stepAngle;
      runAlpha = quantizedAlpha;
    }
  }
  flush(TAU);
  strokeArcRuns(wave.position, wave.r, runs, hue, 90, 66);
}

// ---------------------------------------------------------------------------
// 反射波
// ---------------------------------------------------------------------------

function drawReflectedWave(wave: Wave, baseAlpha: number): void {
  const r = wave.r;
  if (r <= 0.5) return;
  const steps = sampleCountForRadius(r, SECONDARY_RENDER_SAMPLES);
  const stepAngle = TAU / steps;
  const hue = wave.hue.toFixed(1);
  const runs: ArcRun[] = [];
  let runStart = -1;
  let runEnd = 0;
  let runAlpha = 0;

  const flush = (): void => {
    if (runStart < 0) return;
    runs.push({ a0: runStart, a1: runEnd, alpha: runAlpha });
    runStart = -1;
  };
  // 上一次迭代在 am 处的 getWavePathToPoint 结果。
  // 它就是本次迭代 near0 点的结果（同角度、同半径、同波源）。
  let prevMidInvalid = true;
  let midInvalid = null;
  const quantizedAlpha = Math.round(baseAlpha * ALPHA_INV) * ALPHA_STEP;
  const [x, y] = wave.position;
  for (let i = 0; i < steps; i += 1) {
    const a0 = i * stepAngle;
    const a1 = a0 + stepAngle;
    const am = (a0 + a1) * 0.5;
    const target: Point = [x + fastCos(am) * r, y + fastSin(am) * r];
    const cMidInvalid = midInvalid === null ? getWavePathToPoint(wave, target) === null : midInvalid;
    midInvalid = null;
    if (cMidInvalid) {
      if (i === 0) {
        const an = -stepAngle / 2;
        prevMidInvalid = getWavePathToPoint(wave, [x + fastCos(an) * r, y + fastSin(an) * r]) === null;
      }
      if (prevMidInvalid) {
        const an = am + stepAngle;
        const p: Point = [x + fastCos(an) * r, y + fastSin(an) * r];
        midInvalid = getWavePathToPoint(wave, p) === null;
        if (midInvalid) {
          // prevMidInvalid = cMidInvalid;
          // 这里不进行赋值 因为这里确认 prevMidInvalid == cMidInvalid == true
          flush();
          continue;
        }
      }
    }
    prevMidInvalid = cMidInvalid;
    if (runStart < 0) {
      runStart = a0;
      runEnd = a1;
      runAlpha = quantizedAlpha;
    } else if (Math.abs(quantizedAlpha - runAlpha) <= ALPHA_STEP) {
      runEnd = a1;
    } else {
      flush();
      runStart = a0;
      runEnd = a1;
      runAlpha = quantizedAlpha;
    }
  }
  flush();
  strokeArcRuns(wave.position, r, runs, hue, 90, 66);
}

// ---------------------------------------------------------------------------
// 衍射波
// ---------------------------------------------------------------------------

function drawDiffractionWave(wave: Wave, _baseAlpha: number): void {
  const info = wave.diffraction;
  if (!info || wave.r <= 0.5) return;
  const boardOcc = info.board;
  tmpIgnore.clear();
  tmpIgnore.add(info.board.key);
  const ignore = tmpIgnore;

  const steps = sampleCountForRadius(wave.r, SECONDARY_RENDER_SAMPLES);
  const stepAngle = TAU / steps;
  const hue = wave.hue.toFixed(1);
  const [[aX, aY], [bX, bY]] = boardOcc.seg;
  const eX = info.incidentSource[0];
  const eY = info.incidentSource[1];
  // ---- 每波常量：位置项 ----
  const positionFactor = diffractionPositionFactor(boardOcc, info.edgeIndex, info.incidentSource, wave.r);
  // ---- 每波常量：入射方向单位向量 ----
  const inDX = eX - aX;
  const inDY = eY - aY;
  const inLen = Math.sqrt(inDX * inDX + inDY * inDY) || 1;
  const inUx = inDX / inLen;
  const inUy = inDY / inLen;
  // ---- 每波常量：板身楔形几何 ----
  const vecABX = bX - aX;
  const vecABY = bY - aY;
  const denom = vecABX * vecABX + vecABY * vecABY;
  const t = ((eX - aX) * vecABX + (eY - aY) * vecABY) / denom;
  const e1X = eX - 2 * t * vecABX;
  const e1Y = eY - 2 * t * vecABY;
  const vecAE1X = e1X - aX;
  const vecAE1Y = e1Y - aY;
  const crossAB_AE1 = vecABX * vecAE1Y - vecABY * vecAE1X;
  const hasWedge = Math.abs(crossAB_AE1) > 1e-9;

  const edgePt = info.edge;
  const radius = wave.r;

  const runs: ArcRun[] = [];
  let runStart = -1;
  let runEnd = 0;
  let runAlpha = 0;

  const flush = (): void => {
    if (runStart < 0) return;
    runs.push({ a0: runStart, a1: runEnd, alpha: runAlpha });
    runStart = -1;
  };

  // 复用同一个 Point 对象，避免每采样一次小分配
  const p: Point = [0, 0];
  for (let k = 0; k < steps; k += 1) {
    const a0 = k * stepAngle;
    const a1 = a0 + stepAngle;
    const am = a0 + stepAngle * 0.5;
    const cam = fastCos(am);
    const sam = fastSin(am);
    // 板身楔形剔除：vecAP = (cam * radius, sam * radius)，
    // radius > 0 只判符号，省两次乘法。
    if (hasWedge) {
      const crossAB_AP = vecABX * sam - vecABY * cam;
      const crossAE1_AP = vecAE1X * sam - vecAE1Y * cam;
      if (crossAB_AE1 * crossAB_AP >= 0 && crossAB_AE1 * crossAE1_AP <= 0) {
        flush();
        continue;
      }
    }
    p[0] = aX + cam * radius;
    p[1] = aY + sam * radius;
    if (segmentBlockedByBoards(edgePt, p, ignore)) {
      flush();
      continue;
    }
    const angleFactor = diffractionAngleFactor(edgePt, inUx, inUy, p);
    flush();
    runStart = a0;
    runEnd = a1;
    runAlpha = positionFactor * angleFactor;
  }
  flush();
  strokeArcRuns([aX, aY], radius, runs, hue, 90, 66);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function renderWaves(): void {
  waveCtx.clearRect(0, 0, state.deskW, state.deskH);
  waveCtx.lineWidth = WAVE_LW;
  waveCtx.lineCap = "round";
  waveCtx.lineJoin = "round";

  const w = state.deskW;
  const h = state.deskH;

  // 单次遍历收集三类波，避免重复调用 renderWaveAlpha 和重复分支判断。
  const directWaves: Array<[Wave, number]> = [];
  const reflectedWaves: Array<[Wave, number]> = [];
  const diffractionWaves: Array<[Wave, number]> = [];

  for (const wave of state.waves) {
    const alpha = renderWaveAlpha(wave);
    if (alpha < WAVE_REMOVE_ALPHA) continue;
    if (!circleRingIntersectsViewport(wave.position, wave.r, w, h)) continue;
    if (wave.reflections.length > 0) {
      reflectedWaves.push([wave, alpha]);
    } else if (wave.diffraction) {
      diffractionWaves.push([wave, alpha]);
    } else {
      directWaves.push([wave, alpha]);
    }
  }

  // 第一遍绘制主波：直接波永远先建立完整的视觉连续性。
  for (let i = 0; i < directWaves.length; i += 1) {
    const [wave, alpha] = directWaves[i];
    drawDirectWave(wave, alpha);
  }

  // 第二遍绘制二级波：单独一层可以避免 drawDirectWave 的 strokeStyle
  // 改变影响后续波。

  for (let i = 0; i < reflectedWaves.length; i += 1) {
    const [wave, alpha] = reflectedWaves[i];
    drawReflectedWave(wave, alpha);
  }
  for (let i = 0; i < diffractionWaves.length; i += 1) {
    const [wave, alpha] = diffractionWaves[i];
    drawDiffractionWave(wave, alpha);
  }
}
```

这些函数，签名，类型全都是可修改的，

请先检查逻辑上的错误，然后检查是是不是可变类型数值被意外修改

请注意：注释的行为与代码不一致是正常现象，因为经历了很多调整。
