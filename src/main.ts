import './style.css';
type Point = [number, number];
type Segment = [number, number, number, number];
type WaveMode = 'click' | 'continuous';
type BoardDirection = 'v' | 'h';
interface SerializedItem {
  type: string;
  x: number;
  y: number;
  [key: string]: unknown;
}
interface ReflectionHop {
  item: EchoBoard;
  seg: Segment;
  bounce: Point;
}
interface DiffractionInfo {
  board: EchoBoard;
  edgeIndex: number;
  edge: Point;
  incidentSource: Point;
  sideSign: number;
}
interface Wave {
  x: number;
  y: number;
  r: number;
  hue: number;
  freq: number;
  travelDistance: number;
  sourceX: number;
  sourceY: number;
  reflections: ReflectionHop[];
  birthR: number;
  diffraction: DiffractionInfo | null;
  diffractionDepth: number;
  // 低于二级波计算阈值后，停止反射/衍射，并进入平滑淡出。
  fadeOut: number;
  // 仅用于分支去重；不再作为主波渲染的硬遮罩。
  emittedReflections: Set<EchoBoard>;
  emittedDiffractions: Set<string>;
}
interface Occluder {
  item: EchoBoard;
  seg: Segment;
  pts: Point[];
  reflect: boolean;
  cx: number;
  cy: number;
  rad: number;
  key: string;
  ends: Point[];
  nx: number;
  ny: number;
  gains: number[];
}
const GRID = 24;
const GRAVITY = 2400;
const FRICTION = 1100;
const RESTITUTION = 0.6;
const WAVE_TIME = 10;
const WAVE_LW = 1.05;
const MAX_DT = 1 / 30;
const TAU = Math.PI * 2;
const EMIT_SLOW = 1;
const EMIT_FAST = 0.05;
const RES_RANGE = GRID * 8;
const RES_DETUNE = 0.035;
const FREQ_TABLE = [
  10, 19.95, 39.81, 79.43, 158.49, 316.23, 630.96, 1258.93, 2511.89, 5011.87, 10000,] as const;
const TOP_LEVEL = FREQ_TABLE.length - 1;
const FREQ_MIN = FREQ_TABLE[0];
const FREQ_MAX = FREQ_TABLE[TOP_LEVEL];
const DIFF_DECAY = GRID * 5.2;
const DIFF_MIN_ALPHA = 0.012;
const DIFF_GAP_RANGE = GRID * 4;
const DIFF_EDGE_POWER = 0.72;
const MAX_REFLECTION_DEPTH = 3;
const MAX_DIFFRACTION_DEPTH = 3;
const X_LIMIT = GRID * 12;
const MIN_WAVE_EFFECTIVE_ALPHA = 0.018;
const WAVE_FADE_DURATION = 0.28;
const WAVE_REMOVE_ALPHA = 0.001;
const CAR_CROSS_TIME = 20;
const CAR_DEFAULT_FREQ = 316.23;
const CAR_SPEED_MAX = 5;
const RENDER_SAMPLES = 1024;
const SHADOW_SOFTNESS = GRID * 1.35;
const SECONDARY_RENDER_SAMPLES = 384;
const MIN_DRAW_ALPHA = 0.006;
let SAMPLES = 512;
let STEP = TAU / SAMPLES;
let cosT = new Float32Array(SAMPLES);
let sinT = new Float32Array(SAMPLES);
const renderCos = new Float32Array(RENDER_SAMPLES);
const renderSin = new Float32Array(RENDER_SAMPLES);
for (let i = 0; i < RENDER_SAMPLES; i += 1) {
  const a = (i + 0.5) / RENDER_SAMPLES * TAU;
  renderCos[i] = Math.cos(a);
  renderSin[i] = Math.sin(a);
}
function rebuildTables(): void {
  STEP = TAU / SAMPLES;
  cosT = new Float32Array(SAMPLES);
  sinT = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i += 1) {
    const a = (i + 0.5) * STEP;
    cosT[i] = Math.cos(a);
    sinT[i] = Math.sin(a);
  }
}
const clamp = (v: number, a: number, b: number): number => v < a ? a : v > b ? b : v;
const mod = (i: number, n: number): number => ((i % n) + n) % n;
const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
rebuildTables();
const deskEl = $('desk');
const canvas = $('waves') as HTMLCanvasElement;
const waveCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
if (!waveCtx) throw new Error('Canvas 2D context unavailable');
const toolbar = $('toolbar');
const menuEl = $('menu');
const toolsEl = $('tools');
const pauseBtn = $('btn-pause') as HTMLButtonElement;
const fileIn = $('file-input') as HTMLInputElement;
const sampleRange = $('sample-range') as HTMLInputElement;
const sampleVal = $('sample-val');
let DESK_W = 0;
let DESK_H = 0;
let WAVE_SPEED = 100;
let MAX_R = 1000;
let DPR = Math.min(window.devicePixelRatio || 1, 2);
const items: Tool[] = [];
let waves: Wave[] = [];
let paused = false;
let occluders: Occluder[] = [];
function layout(): void {
  DESK_W = Math.floor(window.innerWidth);
  const toolbarH = toolbar.offsetHeight;
  DESK_H = Math.max(GRID, Math.floor((window.innerHeight - toolbarH) / GRID) * GRID);
  deskEl.style.width = `${DESK_W}px`;
  deskEl.style.height = `${DESK_H}px`;
  deskEl.style.backgroundSize = `${GRID}px ${GRID}px, ${GRID}px ${GRID}px`;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(DESK_W * DPR));
  canvas.height = Math.max(1, Math.floor(DESK_H * DPR));
  canvas.style.width = `${DESK_W}px`;
  canvas.style.height = `${DESK_H}px`;
  waveCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const halfDiag = Math.hypot(DESK_W / 2, DESK_H / 2);
  WAVE_SPEED = halfDiag / WAVE_TIME;
  MAX_R = halfDiag * 1.15;
  for (const item of items) item.keepInsideDesk();
}
function freqHue(freq: number): number {
  const t = Math.log10(clamp(freq, FREQ_MIN, FREQ_MAX) / FREQ_MIN) / 3;
  return clamp(t, 0, 1) * 270;
}
function waveInterval(freq: number): number {
  const t = Math.log10(clamp(freq, FREQ_MIN, FREQ_MAX) / FREQ_MIN) / 3;
  return EMIT_SLOW * Math.pow(EMIT_FAST / EMIT_SLOW, clamp(t, 0, 1));
}
function waveAlphaAt(radius: number): number {
  const rGrid = Math.max(1, radius / GRID);
  // 2D 圆柱波近似：1/sqrt(r)。
  // 不再用过于激进的视觉压暗，保证远处波仍然有连续存在感。
  return clamp(1.45 / Math.sqrt(rGrid), 0, 1);
}
function effectiveWaveAlpha(wave: Wave): number {
  return waveAlphaAt(wave.r)
}
function renderWaveAlpha(wave: Wave): number {
  return effectiveWaveAlpha(wave) * wave.fadeOut;
}
function makeWave(x: number, y: number, freq: number, radius = 0, travelDistance = 0,): Wave {
  return {
    x, y, r: radius, hue: freqHue(freq), freq, travelDistance, sourceX: x, sourceY: y, reflections: [], birthR: 0, diffraction: null, diffractionDepth: 0, fadeOut: 1, emittedReflections: new Set(), emittedDiffractions: new Set(),
  };
}
function pushWave(wave: Wave): void {
  wave.fadeOut = 1;
  waves.push(wave);
}
function emitWaveAt(x: number, y: number, freq: number,): void {
  pushWave(makeWave(x, y, freq));
}
function emitWave(item: Tool, freqOverride?: number,): void {
  const source = item.getEmissionPoint();
  const freq = freqOverride ??
    (item as TuningFork).freq ??
    CAR_DEFAULT_FREQ;
  emitWaveAt(source[0], source[1], freq);
}
function collectOccluders(): void {
  occluders = [];
  for (const raw of items) {
    if (raw.removed || raw.dragging || raw.constructor !== EchoBoard) {
      continue;
    }
    const board = raw as EchoBoard;
    const seg = board.seg();
    const [ax, ay, bx, by] = seg;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const nx = -dy / len;
    const ny = dx / len;
    occluders.push({
      item: board, seg, pts: board.pts(), reflect: board.reflect, cx: (ax + bx) / 2, cy: (ay + by) / 2, rad: len / 2, key: `${board.px},${board.py},${board.gw},${board.gh},${board.dir},${board.len}`, ends: [[ax, ay], [bx, by]], nx, ny, gains: [1, 1],
    });
  }
  const allEnds = occluders.flatMap((o) => o.ends);
  for (const o of occluders) {
    o.gains = o.ends.map((edge) => {
      let nearest = Infinity;
      for (const other of allEnds) {
        if (other === edge) continue;
        nearest = Math.min(nearest, Math.hypot(other[0] - edge[0], other[1] - edge[1],));
      }
      if (!Number.isFinite(nearest)) return 1;
      const slit = 1 - clamp(nearest / DIFF_GAP_RANGE, 0, 1);
      return 1 + slit * 1.2;
    });
  }
}
function rayHitSegment(ox: number, oy: number, ux: number, uy: number, ax: number, ay: number, bx: number, by: number,): { t: number; u: number; x: number; y: number } | null {
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
  return {
    t, u, x: ox + ux * t, y: oy + uy * t,
  };
}
function segmentBlockedByBoards(start: Point, end: Point, ignore: Set<EchoBoard> = new Set(),): boolean {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const ux = dx / len;
  const uy = dy / len;
  for (const o of occluders) {
    if (ignore.has(o.item)) continue;
    const hit = rayHitSegment(start[0], start[1], ux, uy, ...o.seg);
    if (!hit) continue;
    if (hit.t > 1e-3 && hit.t < len - 1e-3) {
      return true;
    }
  }
  return false;
}
function reflectPointAcrossLine(px: number, py: number, seg: Segment,): Point {
  const [ax, ay, bx, by] = seg;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [px, py];
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return [
    2 * qx - px, 2 * qy - py,];
}
function pointSegmentDistanceSquared(px: number, py: number, seg: Segment,): number {
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
function circleSegmentIntersections(cx: number, cy: number, radius: number, seg: Segment,): Point[] {
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
    out.push([
      ax + dx * t, ay + dy * t,]);
  }
  if (Math.abs(t2 - t1) > 1e-7 && t2 >= -1e-6 && t2 <= 1 + 1e-6) {
    const t = clamp(t2, 0, 1);
    out.push([
      ax + dx * t, ay + dy * t,]);
  }
  return out;
}
function getOccluder(item: EchoBoard,): Occluder | null {
  return (occluders.find((o) => o.item === item) ??
    null);
}
/**
 * 反射波路径。
 *
 * 对直接波：source -> target。
 * 对反射波：使用展开法反解每一处实际反射点。
 */
function getWavePathToPoint(wave: Wave, target: Point, finalIgnore?: EchoBoard,): Point[] | null {
  const virtualDistance = Math.hypot(target[0] - wave.x, target[1] - wave.y);
  if (wave.reflections.length > 0 && virtualDistance + 1e-3 < wave.birthR) {
    return null;
  }
  if (wave.reflections.length === 0) {
    const source: Point = [
      wave.sourceX, wave.sourceY,];
    const ignore = new Set<EchoBoard>();
    if (finalIgnore) ignore.add(finalIgnore);
    if (segmentBlockedByBoards(source, target, ignore,)) {
      return null;
    }
    return [source, target];
  }
  let currentSource: Point = [
    wave.x, wave.y,];
  let currentTarget: Point = [
    target[0], target[1],];
  const reverseBounces: Point[] = [];
  for (let i = wave.reflections.length - 1;
    i >= 0;
    i -= 1) {
    const hop = wave.reflections[i];
    const board = getOccluder(hop.item);
    if (!board) return null;
    const dx = currentTarget[0] - currentSource[0];
    const dy = currentTarget[1] - currentSource[1];
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-6) return null;
    const hit = rayHitSegment(currentSource[0], currentSource[1], dx / distance, dy / distance, ...board.seg);
    if (!hit || hit.t > distance + 1e-3) {
      return null;
    }
    reverseBounces.push([
      hit.x, hit.y,]);
    currentSource = reflectPointAcrossLine(currentSource[0], currentSource[1], board.seg);
    currentTarget = reflectPointAcrossLine(currentTarget[0], currentTarget[1], board.seg);
  }
  const bounces = reverseBounces.reverse();
  const source: Point = [
    wave.sourceX, wave.sourceY,];
  const path: Point[] = [
    source, ...bounces, target,];
  for (let i = 0;
    i < path.length - 1;
    i += 1) {
    const ignore = new Set<EchoBoard>();
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
    if (segmentBlockedByBoards(path[i], path[i + 1], ignore,)) {
      return null;
    }
  }
  return path;
}
function wavePathToPoint(wave: Wave, target: Point, finalIgnore?: EchoBoard,): boolean {
  return (getWavePathToPoint(wave, target, finalIgnore,) !== null);
}
function diffractionEnvelope(o: Occluder, edge: Point, source: Point, target: Point, rr: number,): number {
  const incomingX = source[0] - edge[0];
  const incomingY = source[1] - edge[1];
  const incomingLen = Math.hypot(incomingX, incomingY,) || 1;
  const outgoingX = target[0] - edge[0];
  const outgoingY = target[1] - edge[1];
  const outgoingLen = Math.hypot(outgoingX, outgoingY,) || 1;
  const cosTurn = clamp((incomingX * outgoingX + incomingY * outgoingY) / (incomingLen * outgoingLen), -1, 1);
  const turn = Math.acos(cosTurn);
  const grazing = Math.pow(Math.max(0, Math.sin(turn)), 0.55);
  const shadowFill = Math.pow(clamp((1 - cosTurn) * 0.5, 0, 1,), DIFF_EDGE_POWER);
  const angularGain = clamp(0.15 + 0.85 *
    Math.max(grazing, shadowFill,), 0, 1);
  const pathAttenuation = 1 / Math.sqrt(1 + rr / DIFF_DECAY);
  const edgeDistanceAttenuation = 1 / Math.sqrt(1 + incomingLen /
    (GRID * 3.5));
  const edgeIndex = o.ends.indexOf(edge);
  const edgeWeight = 0.65 + 0.35 *
    clamp((o.gains[edgeIndex] ?? 1) - 1, 0, 1);
  return clamp(angularGain *
    pathAttenuation *
    edgeDistanceAttenuation *
    edgeWeight, 0, 1);
}
function getIncidentSource(wave: Wave, path: Point[],): Point {
  if (path.length >= 2) {
    const p = path[path.length - 2];
    return [
      p[0], p[1],];
  }
  return [
    wave.sourceX, wave.sourceY,];
}
function createReflectedWave(parent: Wave, o: Occluder, bounce: Point,): Wave | null {
  if (parent.reflections.length >= MAX_REFLECTION_DEPTH) {
    return null;
  }
  if (parent.reflections.some((hop) => hop.item === o.item,)) {
    return null;
  }
  if (!o.reflect) {
    return null;
  }
  const nextTravelDistance = parent.travelDistance + parent.r;
  const [mx, my] = reflectPointAcrossLine(parent.x, parent.y, o.seg);
  const next = makeWave(mx, my, parent.freq, parent.r, nextTravelDistance);
  next.hue = parent.hue;
  next.sourceX = parent.sourceX;
  next.sourceY = parent.sourceY;
  next.reflections = [
    ...parent.reflections, {
      item: o.item, seg: [...o.seg] as Segment, bounce: [
        bounce[0], bounce[1],],
    },];
  next.birthR = parent.r;
  next.diffraction = null;
  next.diffractionDepth = parent.diffractionDepth;
  return next;
}
function createDiffractionWave(parent: Wave, o: Occluder, edgeIndex: number, incidentSource: Point,): Wave | null {
  if (parent.diffractionDepth >= MAX_DIFFRACTION_DEPTH) {
    return null;
  }
  const edge = o.ends[edgeIndex];
  const source: Point = [
    parent.x, parent.y,];
  const sideSign = ((source[0] -
    o.seg[0]) * o.nx + (source[1] -
      o.seg[1]) * o.ny);
  if (Math.abs(sideSign) < 0.5) {
    return null;
  }
  const nextTravelDistance = parent.travelDistance + parent.r;
  const next = makeWave(edge[0], edge[1], parent.freq, 0, nextTravelDistance);
  next.hue = parent.hue;
  next.sourceX = edge[0];
  next.sourceY = edge[1];
  next.reflections = [];
  next.birthR = 0;
  next.diffraction = {
    board: o.item, edgeIndex, edge: [
      edge[0], edge[1],], incidentSource: [
        incidentSource[0], incidentSource[1],], sideSign,
  };
  next.diffractionDepth = parent.diffractionDepth + 1;
  return next;
}
function spawnSecondaryWaves(wave: Wave,): void {
  // 已经超过累计传播距离上限的波不再产生新的次生波。
  // 初始波的 travelDistance = 0，因此仍然可以在第一次碰板时反射/衍射。
  if (wave.travelDistance > X_LIMIT) return;
  // -------------------------
  // 反射
  // -------------------------
  if (wave.reflections.length <
    MAX_REFLECTION_DEPTH) {
    for (const o of occluders) {
      if (wave.emittedReflections.has(o.item,)
      ) {
        continue;
      }
      if (wave.diffraction?.board === o.item
      ) {
        continue;
      }
      const minDist2 = pointSegmentDistanceSquared(wave.x, wave.y, o.seg);
      if (wave.r * wave.r <
        minDist2 - 1e-3
      ) {
        continue;
      }
      const hits = circleSegmentIntersections(wave.x, wave.y, wave.r, o.seg);
      for (const hit of hits) {
        const path = getWavePathToPoint(wave, hit, o.item);
        if (!path) continue;
        const bounce = path[path.length - 1];
        const reflected = createReflectedWave(wave, o, bounce);
        if (reflected) {
          pushWave(reflected);
          wave.emittedReflections.add(o.item);
          break;
        }
      }
    }
  }
  // -------------------------
  // 衍射
  // -------------------------
  if (wave.diffractionDepth >= MAX_DIFFRACTION_DEPTH) {
    return;
  }
  for (const o of occluders) {
    if (wave.diffraction?.board === o.item) {
      continue;
    }
    const lastReflection = wave.reflections[
      wave.reflections.length - 1
    ];
    if (lastReflection?.item === o.item) {
      continue;
    }
    for (let edgeIndex = 0;
      edgeIndex < o.ends.length;
      edgeIndex += 1) {
      const key = `${o.key}:${edgeIndex}`;
      if (wave.emittedDiffractions.has(key,)
      ) {
        continue;
      }
      const edge = o.ends[edgeIndex];
      const dist = Math.hypot(edge[0] - wave.x, edge[1] - wave.y);
      if (wave.r + 1e-3 < dist
      ) {
        continue;
      }
      const path = getWavePathToPoint(wave, edge, o.item);
      if (!path) continue;
      const incidentSource = getIncidentSource(wave, path);
      const child = createDiffractionWave(wave, o, edgeIndex, incidentSource);
      if (!child) continue;
      wave.emittedDiffractions.add(key);
      pushWave(child);
    }
  }
}
// ============================================================// 新的波形可见度系统
// ============================================================//
// 因此波前穿过板子时不会因为帧间半径变化而产生硬闪。
// 同时仍然遵守真实几何：板子后方不会永久恢复成直达波。
function directVisibility(wave: Wave, ux: number, uy: number,): number {
  let visibility = 1;
  for (const o of occluders) {    // 衍射波的母板只负责定义边缘，不作为自己的遮挡体。
    if (wave.diffraction?.board === o.item) {
      continue;
    }
    const hit = rayHitSegment(wave.x, wave.y, ux, uy, ...o.seg);
    if (!hit) continue;
    const delta = hit.t - wave.r;
    // 板子还没有被波前触及。
    if (delta >= SHADOW_SOFTNESS) {
      continue;
    }
    // 已经深入阴影区域。
    if (delta <= -SHADOW_SOFTNESS) {
      visibility = 0;
      break;
    }
    const local = smoothstep(-SHADOW_SOFTNESS, SHADOW_SOFTNESS, delta);
    visibility = Math.min(visibility, local);
    if (visibility <= 0.001) {
      break;
    }
  }
  return visibility;
}
function reflectionVisibility(wave: Wave, target: Point,): number {
  return wavePathToPoint(wave, target,)
    ? 1
    : 0;
}
/**
 * 为了避免 Canvas 在每一个角度创建大量随机 alpha 状态，
 * 这里按“连续可见区间”合并采样。
 *
 * 每个小弧段根据 visibility 使用自己的 strokeStyle。
 * 当相邻采样颜色接近时会自动合并，因此视觉上仍然是一条
 * 连续的波，而不是点状虚线。
 */
function drawDirectWave(wave: Wave, baseAlpha: number,): void {
  if (wave.r <= 0.5) return;
  const samples = Math.min(RENDER_SAMPLES, Math.max(256, Math.ceil(wave.r / 2,),));
  const hue = wave.hue.toFixed(1);
  const ALPHA_STEP = 0.04;
  let runStart = -1;
  let runAlpha = 0;
  const flush = (endIndex: number,): void => {
    if (runStart < 0 || runAlpha < MIN_DRAW_ALPHA) {
      runStart = -1;
      runAlpha = 0;
      return;
    }
    const a0 = runStart / samples * TAU;
    const a1 = endIndex / samples * TAU;
    waveCtx.strokeStyle = `hsla(${hue},90%,66%,${runAlpha.toFixed(3)})`;
    waveCtx.beginPath();
    waveCtx.arc(wave.x, wave.y, wave.r, a0, a1);
    waveCtx.stroke();
    runStart = -1;
    runAlpha = 0;
  };
  for (let i = 0; i <= samples; i += 1) {
    if (i === samples) {
      flush(i);
      continue;
    }
    const angle = (i + 0.5) / samples * TAU;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const visibility = directVisibility(wave, ux, uy);
    const alpha = baseAlpha * (0.035 + 0.965 * visibility);
    if (alpha < MIN_DRAW_ALPHA) {
      flush(i);
      continue;
    }
    const quantizedAlpha = Math.round(alpha / ALPHA_STEP) * ALPHA_STEP;
    if (runStart < 0) {
      runStart = i;
      runAlpha = quantizedAlpha;
      continue;
    }
    // 只合并透明度接近的弧段。某个方向被隔音板遮挡时，不会把整个连续弧段压成同一个低透明度。
    if (Math.abs(quantizedAlpha - runAlpha) > ALPHA_STEP) {
      flush(i);
      runStart = i;
      runAlpha = quantizedAlpha;
    }
  }
}
/**
 * 反射波仍使用几何路径判断，但把采样提高并用短弧段绘制。
 * 关键是：反射波不再依赖一个可能在某帧全部变空的 run。
 */
function drawReflectedWave(wave: Wave, baseAlpha: number,): void {
  if (wave.r <= 0.5) return;
  const steps = SECONDARY_RENDER_SAMPLES;
  const hue = wave.hue.toFixed(1);
  for (let i = 0;
    i < steps;
    i += 1) {
    const a0 = i / steps * TAU;
    const a1 = (i + 1) / steps * TAU;
    const am = (a0 + a1) * 0.5;
    const target: Point = [
      wave.x + Math.cos(am) *
      wave.r, wave.y + Math.sin(am) *
      wave.r,];
    let visible = reflectionVisibility(wave, target);
    if (visible === 0) {
      const near0: Point = [
        wave.x + Math.cos(am - TAU / steps) *
        wave.r, wave.y + Math.sin(am - TAU / steps) *
        wave.r,];
      const near1: Point = [
        wave.x + Math.cos(am + TAU / steps) *
        wave.r, wave.y + Math.sin(am + TAU / steps) *
        wave.r,];
      if (reflectionVisibility(wave, near0,) || reflectionVisibility(wave, near1,)
      ) {
        visible = 0.35;
      }
    }
    if (visible <= 0) continue;
    waveCtx.strokeStyle = `hsla(${hue},92%,70%,${(baseAlpha * visible).toFixed(3)})`;
    waveCtx.beginPath();
    waveCtx.arc(wave.x, wave.y, wave.r, a0, a1);
    waveCtx.stroke();
  }
}

function drawDiffractionWave(wave: Wave, baseAlpha: number): void {
  const info = wave.diffraction;
  if (!info || wave.r <= 0.5) { return; }
  const boardOcc = getOccluder(info.board);
  if (!boardOcc) return;
  const ignore = new Set<EchoBoard>([info.board]);
  const steps = SECONDARY_RENDER_SAMPLES;
  const hue = wave.hue.toFixed(1);
  const aX = info.edge[0];
  const aY = info.edge[1];
  const b = boardOcc.ends[1 - info.edgeIndex];
  const bX = b[0];
  const bY = b[1];
  const eX = info.incidentSource[0];
  const eY = info.incidentSource[1];
  // AB 方向向量
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

  for (let k = 0; k < steps; k += 1) {
    const a0 = (k / steps) * TAU;
    const a1 = ((k + 1) / steps) * TAU;
    const am = (a0 + a1) * 0.5;
    const px = aX + Math.cos(am) * wave.r;
    const py = aY + Math.sin(am) * wave.r;
    if (hasWedge) {
      const vecAPX = px - aX;
      const vecAPY = py - aY;
      const crossAB_AP = vecABX * vecAPY - vecABY * vecAPX;
      const crossAE1_AP = vecAE1X * vecAPY - vecAE1Y * vecAPX;
      if (crossAB_AE1 * crossAB_AP >= 0 && crossAB_AE1 * crossAE1_AP <= 0) { continue; }
    }
    const target: Point = [px, py];
    if (segmentBlockedByBoards(info.edge, target, ignore)) { continue; }

    const localGain = diffractionEnvelope(boardOcc, info.edge, info.incidentSource, target, wave.r);
    const a = baseAlpha * localGain;
    if (a < DIFF_MIN_ALPHA) { continue; }

    waveCtx.strokeStyle = `hsla(${hue},92%,74%,${a.toFixed(3)})`;
    waveCtx.beginPath();
    waveCtx.arc(aX, aY, wave.r, a0, a1);
    waveCtx.stroke();
  }
}

function renderWaves(): void {
  waveCtx.clearRect(0, 0, DESK_W, DESK_H);
  waveCtx.lineWidth = WAVE_LW;
  waveCtx.lineCap = 'round';
  waveCtx.lineJoin = 'round';
  // 第一遍绘制主波。
  // 这样直接波永远先建立完整的视觉连续性。
  for (const wave of waves) {
    const alpha = renderWaveAlpha(wave);
    if (alpha <
      WAVE_REMOVE_ALPHA) {
      continue;
    }
    if (wave.reflections.length === 0 && !wave.diffraction) {
      drawDirectWave(wave, alpha);
    }
  }
  // 第二遍绘制二级波。
  // 单独一层可以避免 drawDirectWave 的 strokeStyle 改变
  // 影响后续波。
  for (const wave of waves) {
    const alpha = renderWaveAlpha(wave);
    if (alpha <
      WAVE_REMOVE_ALPHA) {
      continue;
    }
    if (wave.reflections.length > 0) {
      drawReflectedWave(wave, alpha);
    } else if (wave.diffraction) {
      drawDiffractionWave(wave, alpha);
    }
  }
}
function updateWaves(dt: number,): void {
  if (!waves.length) return;
  collectOccluders();
  for (let i = waves.length - 1; i >= 0; i -= 1) {
    const wave = waves[i];
    wave.r += WAVE_SPEED * dt;
    const physicalAlpha = effectiveWaveAlpha(wave);
    // 半径生命周期仍然是最终保险，避免任何异常情况下波无限存在。
    if (wave.r > MAX_R) {
      waves.splice(i, 1);
      continue;
    }
    // 一旦波弱到不值得继续做反射/衍射计算，立即停止二级波生成，
    // 但不要立即删除。保留一个短暂的淡出阶段，让动画连续。
    if (physicalAlpha < MIN_WAVE_EFFECTIVE_ALPHA) {
      wave.fadeOut = Math.max(0, wave.fadeOut - dt / WAVE_FADE_DURATION);
    } else {
      wave.fadeOut = 1;
    }
    if (wave.fadeOut <= 0) {
      waves.splice(i, 1);
      continue;
    }
    spawnSecondaryWaves(wave);
  }
}
function setSampleDensity(raw: number,): void {
  const n = clamp(Math.round(raw / 64) * 64, 256, 2048);
  sampleRange.value = String(n);
  sampleVal.textContent = String(n);
  if (n === SAMPLES) return;
  SAMPLES = n;
  rebuildTables();
  // 新渲染系统不再保存 blocked mask。
  // 修改模拟采样密度不会重建波形对象，也不会让现有波瞬间消失。
}

class Tool {
  static shape = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="12" fill="#8fb6ff"/></svg>';
  static size:
    readonly [number, number] = [2, 2];
  static label = '工具';
  static icon = '▢';
  static waveKind:
    'none' | 'block' = 'none';
  static gravity = true;
  static isPlatform = false;
  static onMove(_item: Tool, _dt: number,): void { }
  static onClick(_item: Tool, _evt?: PointerEvent,): void { }
  static onContextMenu(item: Tool,): HTMLElement {
    return createContextMenu(item);
  }
  static onRelease(_item: Tool,): void { }
  type: string;
  gw: number;
  gh: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx = 0;
  vy = 0;
  grounded = false;
  dragging = false;
  removed = false;
  el: HTMLDivElement;
  constructor(gx: number, gy: number,) {
    const C = this.constructor as typeof Tool;
    this.type = C.name;
    this.gw = C.size[0];
    this.gh = C.size[1];
    this.x = Math.round(gx);
    this.y = Math.round(gy);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
    this.el = document.createElement('div');
    this.el.className = 'item';
    this.el.style.width = `${this.gw * GRID}px`;
    this.el.style.height = `${this.gh * GRID}px`;
    this.el.innerHTML = C.shape;
    deskEl.appendChild(this.el);
    this.el.addEventListener('pointerdown', (event) => {
      startDrag(event, this);
    });
    this.el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(event.clientX, event.clientY, this);
    });
    this.render();
  }
  get w(): number {
    return this.gw * GRID;
  }
  get h(): number {
    return this.gh * GRID;
  }
  getEmissionPoint(): Point {
    return [
      this.px + this.w / 2, this.py + this.h / 2,];
  }
  fitElement(): void {
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
  }
  pts(): Point[] {
    return [
      [
        this.px, this.py,], [
        this.px + this.w, this.py,], [
        this.px + this.w, this.py + this.h,], [
        this.px, this.py + this.h,],];
  }
  segments(): Segment[] {
    const x = this.px;
    const y = this.py;
    const w = this.w;
    const h = this.h;
    return [
      [
        x, y, x + w, y,], [
        x + w, y, x + w, y + h,], [
        x + w, y + h, x, y + h,], [
        x, y + h, x, y,],];
  }
  keepInsideDesk(): void {
    const maxX = Math.max(0, DESK_W - this.w);
    const maxY = Math.max(0, DESK_H - this.h);
    this.px = clamp(this.px, 0, maxX);
    this.py = clamp(this.py, 0, maxY);
    this.x = Math.round(this.px / GRID);
    this.y = Math.round(this.py / GRID);
  }
  snapToGrid(): void {
    const maxGX = Math.max(0, Math.floor((DESK_W - this.w) /
      GRID,));
    const maxGY = Math.max(0, Math.floor((DESK_H - this.h) /
      GRID,));
    this.x = clamp(Math.round(this.px / GRID,), 0, maxGX);
    this.y = clamp(Math.round(this.py / GRID,), 0, maxGY);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
  }
  supportY(): number {
    const floor = DESK_H - this.h;
    let support = floor;
    for (const platform of items) {
      if (platform === this || platform.removed || !(platform.constructor as
        typeof Tool
      ).isPlatform
      ) {
        continue;
      }
      if (this.px + this.w <= platform.px + 1 || this.px >= platform.px + platform.w - 1
      ) {
        continue;
      }
      const top = platform.py -
        this.h;
      if (top <= this.py + 2 && top < support
      ) {
        support = top;
      }
    }
    return support;
  }
  stepPhysics(dt: number,): void {
    const floor = DESK_H - this.h;
    if (!this.grounded) {
      this.vy += GRAVITY * dt;
      const oldBottom = this.py + this.h;
      this.py += this.vy * dt;
      const newBottom = this.py + this.h;
      let landed = false;
      if (newBottom >= DESK_H
      ) {
        this.py = floor;
        landed = true;
      } else {
        for (const platform of items
        ) {
          if (platform === this || platform.removed || !(platform.constructor as
            typeof Tool
          ).isPlatform
          ) {
            continue;
          }
          if (this.px + this.w <= platform.px + 1 || this.px >= platform.px + platform.w - 1
          ) {
            continue;
          }
          if (oldBottom <= platform.py + 0.5 && newBottom >= platform.py
          ) {
            this.py = platform.py -
              this.h;
            landed = true;
            break;
          }
        }
      }
      if (landed) {
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      const support = this.supportY();
      if (this.py <
        support - 1
      ) {
        this.grounded = false;
        this.vy = 0;
      } else {
        this.py = support;
        this.vy = 0;
      }
    }
    if (this.grounded) {
      const dec = FRICTION * dt;
      if (Math.abs(this.vx) <= dec
      ) {
        this.vx = 0;
      } else {
        this.vx -= Math.sign(this.vx,) * dec;
      }
    }
    this.px += this.vx * dt;
    if (this.px < 0) {
      this.px = 0;
      this.vx = Math.abs(this.vx) > 30 ? -this.vx * RESTITUTION : 0;
    } else if (this.px + this.w > DESK_W) {
      this.px = DESK_W - this.w;
      this.vx = Math.abs(this.vx) > 30
        ? -this.vx *
        RESTITUTION
        : 0;
    }
    if (this.grounded && this.vx === 0) {
      this.snapToGrid();
    }
  }
  update(dt: number): void {
    const C = this.constructor as typeof Tool;
    if (!this.dragging && C.gravity) {
      this.stepPhysics(dt);
    }
    C.onMove(this, dt);
    this.render();
  }
  render(): void {
    this.el.style.transform = `translate(${this.px}px,${this.py}px)`;
  }
  serialize(): SerializedItem {
    return {
      type: this.type, x: Math.round(this.px / GRID,), y: Math.round(this.py / GRID,),
    };
  }
  deserialize(data: SerializedItem,): void {
    this.x = Math.round(typeof data.x === 'number'
      ? data.x
      : 0);
    this.y = Math.round(typeof data.y === 'number'
      ? data.y
      : 0);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.keepInsideDesk();
    this.render();
  }
  remove(): void {
    this.removed = true;
    this.el.remove();
  }
}
class TuningFork
  extends Tool {
  static label = '音叉';
  static icon = '♬';
  static size:
    readonly [number, number] = [3, 5];
  static waveKind:
    'none' = 'none';
  static gravity = true;
  static shape = `
    <svg viewBox="0 0 72 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fork-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fbfdff"/>
          <stop offset=".32" stop-color="#d8e7f8"/>
          <stop offset=".68" stop-color="#7d9bbd"/>
          <stop offset="1" stop-color="#46658a"/>
        </linearGradient>
        <linearGradient id="fork-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#eef6ff"/>
          <stop offset="1" stop-color="#5b7698"/>
        </linearGradient>
        <filter id="fork-shadow" x="-60%" y="-30%" width="220%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#040815" flood-opacity=".8"/>
        </filter>
      </defs>
      <g filter="url(#fork-shadow)">
        <path class="fork-tines" fill="url(#fork-metal)" d="M13 11c-4 0-6 3-6 7v35c0 12 6 19 17 22V31c0-7-4-20-11-20zm46 0c-7 0-11 13-11 20v44c11-3 17-10 17-22V18c0-4-2-7-6-7z"/>
        <path fill="url(#fork-metal)" d="M22 70h28c-2 7-7 12-14 14-7-2-12-7-14-14z"/>
        <rect x="31" y="80" width="10" height="27" rx="5" fill="url(#fork-side)"/>
        <path d="M26 106h20c3 0 5 2 5 5v2H21v-2c0-3 2-5 5-5z" fill="url(#fork-metal)"/>
        <ellipse cx="36" cy="113" rx="12" ry="3" fill="#314864" opacity=".8"/>
      </g>
      <path class="hit-hint" d="M7 8h58v109H7z"/>
    </svg>`;
  freq = 316.23;
  level = 5;
  mode: WaveMode = 'click';
  emitTimer = 0;
  vib = 0;
  resonance = 0;
  resTimer = 0;
  constructor(gx: number, gy: number,) {
    super(gx, gy);
    this.grounded = false;
  }
  static onMove(raw: Tool, dt: number,): void {
    const item = raw as TuningFork;
    if (item.mode === 'continuous') {
      item.vib = 1;
      item.emitTimer -= dt;
      if (item.emitTimer <= 0
      ) {
        item.emitTimer = waveInterval(item.freq);
        emitWave(item);
      }
    } else {
      item.vib = Math.max(0, item.vib -
        dt * 0.6);
      item.emitTimer = 0;
    }
    let drive = 0;
    if (item.vib < 0.95) {
      for (const otherRaw of items
      ) {
        if (otherRaw === item || otherRaw.removed || !(otherRaw instanceof
          TuningFork
        )
        ) {
          continue;
        }
        const other = otherRaw as TuningFork;
        if (other.vib < 0.3
        ) continue;
        if (Math.abs(other.freq -
          item.freq,) /
          item.freq > RES_DETUNE
        ) {
          continue;
        }
        const dx = other.px + other.w / 2 -
          (item.px + item.w / 2
          );
        const dy = other.py + other.h / 2 -
          (item.py + item.h / 2
          );
        const d = Math.hypot(dx, dy);
        if (d <= RES_RANGE
        ) {
          drive = Math.max(drive, other.vib *
            (1 -
              d /
              RES_RANGE
            ));
        }
      }
    }
    item.resonance = Math.max(item.resonance -
      dt * 0.9, drive);
    if (item.mode !== 'continuous' && item.resonance > 0.45) {
      item.resTimer -= dt;
      if (item.resTimer <= 0
      ) {
        item.resTimer = waveInterval(item.freq,) * 1.8;
        emitWave(item);
        item.vib = Math.max(item.vib, 0.75);
      }
    } else if (item.resonance <= 0.15) {
      item.resTimer = 0;
    }
    const glow = Math.max(item.vib, item.resonance);
    const svg = item.el.firstElementChild as
      SVGSVGElement | null;
    const tines = svg?.querySelector('.fork-tines',) as
      SVGPathElement | null;
    if (tines) {
      const sway = Math.sin(performance.now() *
        0.05 *
        Math.max(1, item.freq / 100,),) *
        glow *
        1.6;
      tines.setAttribute('transform', `rotate(${sway.toFixed(2)} 36 72)`);
    }
    if (svg) {
      if (glow > 0.06) {
        const rgb = item.resonance > 0.45
          ? '255,175,255'
          : '150,225,255';
        svg.style.filter = `brightness(${(1 + glow * 0.42
        ).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 9).toFixed(1)}px rgba(${rgb},${(0.35 + glow * 0.55).toFixed(2)}))`;
      } else {
        svg.style.filter = '';
      }
    }
  }
  static onClick(raw: Tool,): void {
    const item = raw as TuningFork;
    if (item.mode !== 'click') {
      return;
    }
    emitWave(item);
    item.vib = 1;
  }
  static onContextMenu(item: Tool,): HTMLElement {
    return buildForkMenu(item as TuningFork);
  }
  serialize(): SerializedItem {
    return {
      ...super.serialize(), freq: this.freq, mode: this.mode,
    };
  }
  deserialize(data: SerializedItem,): void {
    super.deserialize(data);
    if (typeof data.freq === 'number') {
      setFreq(this, data.freq);
    }
    if (data.mode === 'continuous' || data.mode === 'click') {
      this.mode = data.mode;
    }
  }
}
class EchoBoard
  extends Tool {
  static label = '隔音板';
  static icon = '▤';
  static size:
    readonly [number, number] = [1, 12];
  static waveKind:
    'block' = 'block';
  static gravity = false;
  static shape = '<svg viewBox="0 0 100 100"><rect class="hit-hint" x="0" y="0" width="100" height="100" rx="8"/><rect class="board-visual" x="2" y="0" width="12" height="100" rx="6"/></svg>';
  dir: BoardDirection = 'v';
  len = 12;
  reflect = true;
  constructor(gx: number, gy: number,) {
    super(gx, gy);
    this.applyGeom();
  }
  seg(): Segment {
    if (this.dir === 'h') {
      const y = this.py + this.gh * GRID;
      return [
        this.px, y, this.px + this.gw * GRID, y,];
    }
    const x = this.px;
    return [
      x, this.py, x, this.py + this.gh * GRID,];
  }
  pts(): Point[] {
    const s = this.seg();
    return [
      [s[0], s[1]], [s[2], s[3]],];
  }
  segments(): Segment[] {
    return [
      this.seg(),];
  }
  applyGeom(): void {
    this.gw = this.dir === 'h'
      ? this.len
      : 1;
    this.gh = this.dir === 'h'
      ? 1
      : this.len;
    this.fitElement();
    this.paint();
    if (DESK_W) {
      this.keepInsideDesk();
      this.render();
    }
  }
  paint(): void {
    const w = this.w;
    const h = this.h;
    const x = 0;
    const y = this.dir === 'h'
      ? h - 5
      : 0;
    const width = this.dir === 'h'
      ? w
      : 5;
    const height = this.dir === 'h'
      ? 5
      : h;
    this.el.innerHTML = `
      <svg viewBox="0 0 ${Math.max(1, w)} ${Math.max(1, h)}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="board-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f4f8ff"/>
            <stop offset=".5" stop-color="#86b3f0"/>
            <stop offset="1" stop-color="#456fc0"/>
          </linearGradient>
          <filter id="board-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect class="hit-hint" x="0" y="0" width="${w}" height="${h}" rx="5"/>
        <rect x="${x + 1}" y="${y + 1}" width="${Math.max(1, width - 2)}" height="${Math.max(1, height - 2)}" rx="2.5" fill="url(#board-metal)" filter="url(#board-glow)"/>
      </svg>`;
  }
  static onRelease(item: Tool,): void {
    const board = item as EchoBoard;
    board.snapToGrid();
    board.render();
  }
  static onContextMenu(item: Tool,): HTMLElement {
    return buildBoardMenu(item as EchoBoard);
  }
  serialize(): SerializedItem {
    return {
      ...super.serialize(), dir: this.dir, len: this.len, reflect: this.reflect,
    };
  }
  deserialize(data: SerializedItem,): void {
    super.deserialize(data);
    if (data.dir === 'h' || data.dir === 'v') {
      this.dir = data.dir;
    }
    if (typeof data.len === 'number') {
      this.len = clamp(Math.round(data.len,), 3, 24);
    }
    if (typeof data.reflect === 'boolean') {
      this.reflect = data.reflect;
    } else if (typeof data.reflect === 'number') {
      // 兼容旧配置：旧版本反射强度大于 0 视为开启。
      this.reflect = data.reflect > 0;
    }
    this.applyGeom();
  }
}
const SoundBoard = EchoBoard;
class SmallTable
  extends Tool {
  static label = '小桌板';
  static icon = '🪑';
  static size:
    readonly [number, number] = [6, 1];
  static waveKind:
    'none' = 'none';
  static gravity = false;
  static isPlatform = true;
  static shape = `
    <svg viewBox="0 0 144 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="table-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b68857"/>
          <stop offset="1" stop-color="#553d25"/>
        </linearGradient>
      </defs>
      <rect x="9" y="18" width="10" height="6" rx="2" fill="#3a2a1c"/>
      <rect x="125" y="18" width="10" height="6" rx="2" fill="#3a2a1c"/>
      <rect x="1" y="1" width="142" height="18" rx="6" fill="url(#table-top)" stroke="#d8b483" stroke-width="2"/>
      <rect class="hit-hint" x="0" y="0" width="144" height="24" rx="6"/>
    </svg>`;
  static onMove(item: Tool,): void {
    item.snapToGrid();
  }
  static onRelease(item: Tool,): void {
    item.snapToGrid();
    item.render();
  }
}
class Bell
  extends Tool {
  static label = '铃铛';
  static icon = '🔔';
  static size:
    readonly [number, number] = [1, 1];
  static waveKind:
    'none' = 'none';
  static gravity = false;
  static shape = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bell-orb" cx="34%" cy="28%" r="78%">
          <stop offset="0" stop-color="#fff5c7"/>
          <stop offset=".38" stop-color="#f4cd58"/>
          <stop offset=".78" stop-color="#ca8b1e"/>
          <stop offset="1" stop-color="#7b4e0b"/>
        </radialGradient>
      </defs>
      <circle class="hit-hint" cx="12" cy="12" r="10.5"/>
      <circle cx="12" cy="11" r="9.25" fill="url(#bell-orb)" stroke="#f8e49a" stroke-width="1"/>
      <circle cx="9" cy="8" r="2.4" fill="#fff8dc" opacity=".42"/>
      <circle cx="12" cy="12" r="3.15" fill="#ffeaa3" opacity=".48"/>
      <circle cx="12" cy="12" r="1.25" fill="#8f5d12" opacity=".8"/>
    </svg>`;
  freq = 316.23;
  level = 5;
  mode: WaveMode = 'click';
  emitTimer = 0;
  vib = 0;
  static onMove(raw: Tool, dt: number,): void {
    const item = raw as Bell;
    item.vib = Math.max(0, item.vib -
      dt * 0.8);
    if (item.mode === 'continuous') {
      item.vib = Math.max(item.vib, 0.9);
      item.emitTimer -= dt;
      if (item.emitTimer <= 0
      ) {
        item.emitTimer = waveInterval(item.freq);
        emitWave(item);
      }
    } else {
      item.emitTimer = 0;
    }
    const svg = item.el.firstElementChild as
      SVGSVGElement | null;
    if (!svg) return;
    const glow = item.vib;
    svg.style.filter = glow > 0.05
      ? `brightness(${(1 + glow * 0.45).toFixed(2)}) drop-shadow(0 0 ${(3 + glow * 8).toFixed(1)}px rgba(255,215,105,${(0.28 + glow * 0.58).toFixed(2)}))`
      : '';
  }
  static onClick(raw: Tool,): void {
    const item = raw as Bell;
    if (item.mode !== 'click') {
      return;
    }
    emitWave(item);
    item.vib = 1;
  }
  static onRelease(raw: Tool,): void {
    const item = raw as Bell;
    item.snapToGrid();
    item.render();
  }
  static onContextMenu(item: Tool,): HTMLElement {
    return buildToneMenu(item as Bell, '铃铛');
  }
  serialize(): SerializedItem {
    return {
      ...super.serialize(), freq: this.freq, mode: this.mode,
    };
  }
  deserialize(data: SerializedItem,): void {
    super.deserialize(data);
    if (typeof data.freq === 'number') {
      setFreq(this, data.freq);
    }
    if (data.mode === 'continuous' || data.mode === 'click') {
      this.mode = data.mode;
    }
    this.snapToGrid();
    this.render();
  }
}
class Car
  extends Tool {
  static label = '小车';
  static icon = '🚗';
  static size:
    readonly [number, number] = [3, 2];
  static waveKind:
    'none' = 'none';
  static gravity = true;
  static shape = `
    <svg viewBox="0 0 72 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="car-bell" cx="32%" cy="26%" r="78%">
          <stop offset="0" stop-color="#fff4c7"/>
          <stop offset=".36" stop-color="#f0c94f"/>
          <stop offset=".8" stop-color="#bd7e16"/>
          <stop offset="1" stop-color="#724607"/>
        </radialGradient>
        <linearGradient id="car-axle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#546680"/>
          <stop offset=".5" stop-color="#aebbd0"/>
          <stop offset="1" stop-color="#546680"/>
        </linearGradient>
        <radialGradient id="car-wheel" cx="35%" cy="30%">
          <stop offset="0" stop-color="#8191aa"/>
          <stop offset=".42" stop-color="#36435b"/>
          <stop offset="1" stop-color="#151d2c"/>
        </radialGradient>
      </defs>
      <rect class="hit-hint" x="3" y="3" width="66" height="42" rx="10"/>
      <rect x="15" y="32" width="42" height="4" rx="2" fill="url(#car-axle)"/>
      <circle cx="19" cy="39" r="8" fill="url(#car-wheel)" stroke="#101827" stroke-width="1.5" class="car-wheel"/>
      <circle cx="53" cy="39" r="8" fill="url(#car-wheel)" stroke="#101827" stroke-width="1.5" class="car-wheel"/>
      <circle cx="19" cy="39" r="2.8" fill="#c4d1e3"/>
      <circle cx="53" cy="39" r="2.8" fill="#c4d1e3"/>
      <circle cx="36" cy="19" r="13.5" fill="url(#car-bell)" stroke="#f7df8e" stroke-width="1.5"/>
      <circle cx="31.5" cy="14.5" r="3.5" fill="#fff8dd" opacity=".34"/>
      <circle cx="36" cy="19" r="4.1" fill="#ffedab" opacity=".45"/>
      <circle cx="36" cy="19" r="1.65" fill="#8e5a0f" opacity=".85"/>
      <path d="M29 29h14" stroke="#8d5f11" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
    </svg>`;
  running = false;
  speed = 1;
  direction: -1 | 1 = 1;
  emitTimer = 0;
  freq = CAR_DEFAULT_FREQ;
  level = 5;
  wheelPhase = 0;
  update(dt: number): void {
    if (!this.dragging && this.running && this.grounded) {
      const support = this.supportY();
      if (this.py <
        support - 1
      ) {
        this.grounded = false;
      }
    }
    if (!this.dragging && this.running && this.grounded) {
      const travelWidth = Math.max(1, DESK_W - this.w);
      const pxPerSecond = (travelWidth /
        CAR_CROSS_TIME
      ) *
        this.speed;
      this.vx = this.direction *
        pxPerSecond;
      this.px += this.vx * dt;
      this.emitTimer -= dt;
      if (this.emitTimer <= 0
      ) {
        this.emitTimer += waveInterval(this.freq);
        emitWave(this);
      }
      const maxX = Math.max(0, DESK_W - this.w);
      if (this.px <= 0 || this.px >= maxX
      ) {
        this.px = clamp(this.px, 0, maxX);
        this.running = false;
        this.emitTimer = 0;
        this.vx = 0;
        this.grounded = true;
        this.snapToGrid();
      }
      Car.onMove(this, dt);
      this.render();
      return;
    }
    super.update(dt);
  }
  static onMove(raw: Tool, dt: number,): void {
    const item = raw as Car;
    if (item.running) {
      item.wheelPhase += Math.abs(item.vx,) *
        dt /
        9.5;
    }
    const wheels = item.el.querySelectorAll<SVGCircleElement>('.car-wheel');
    const angle = item.wheelPhase.toFixed(2);
    wheels.forEach((wheel) => {
      wheel.setAttribute('transform', `rotate(${angle} ${wheel.getAttribute('cx')} ${wheel.getAttribute('cy')})`);
    });
  }
  static onContextMenu(item: Tool,): HTMLElement {
    return buildCarMenu(item as Car);
  }
  serialize(): SerializedItem {
    return {
      ...super.serialize(), running: this.running, speed: this.speed, direction: this.direction, freq: this.freq,
    };
  }
  deserialize(data: SerializedItem,): void {
    super.deserialize(data);
    if (typeof data.speed === 'number') {
      this.speed = clamp(Math.round(data.speed * 10,) / 10, 0.1, CAR_SPEED_MAX);
    }
    if (data.direction === -1 || data.direction === 1) {
      this.direction = data.direction;
    }
    if (typeof data.freq === 'number') {
      setFreq(this, data.freq);
    }
    if (typeof data.running === 'boolean') {
      this.running = data.running;
    }
    this.emitTimer = 0;
    this.grounded = false;
    this.render();
  }
}
type FrequencySource = TuningFork | Bell | Car;
type ToolClass = typeof Tool;
const TOOL_REGISTRY:
  ToolClass[] = [];
const TOOL_BY_NAME:
  Record<string, ToolClass> = {};
function registerTool(Cls: ToolClass,): void {
  TOOL_REGISTRY.push(Cls);
  TOOL_BY_NAME[
    Cls.name
  ] = Cls;
}
registerTool(TuningFork);
registerTool(Bell);
registerTool(EchoBoard);
registerTool(SmallTable);
registerTool(Car);
// ============================================================// UI / 菜单
// ============================================================
function spawnTool(Cls: ToolClass,): Tool {
  const [
    gw, gh,] = Cls.size;
  const maxGX = Math.max(0, Math.floor((DESK_W -
    gw * GRID) /
    GRID,));
  const maxGY = Math.max(0, Math.floor((DESK_H -
    gh * GRID) /
    GRID,));
  const gx = maxGX > 2
    ? 1 + Math.floor(Math.random() *
      Math.max(1, maxGX - 2,),)
    : 0;
  const gy = Cls === Car
    ? maxGY
    : Cls.gravity
      ? 0
      : Math.max(0, Math.floor(maxGY / 2,));
  const item = new Cls(gx, gy);
  items.push(item);
  return item;
}
function buildToolbar(): void {
  toolsEl.innerHTML = '';
  for (const C of TOOL_REGISTRY) {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.type = 'button';
    button.innerHTML = `<span class="ico">${C.icon}</span><span>${C.label}</span>`;
    button.title = `添加${C.label}（${C.size[0]}×${C.size[1]} 网格，隔音板可调整长度）`;
    button.addEventListener('click', () => {
      spawnTool(C);
    });
    toolsEl.appendChild(button);
  }
}
function startDrag(event: PointerEvent, item: Tool,): void {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  closeMenu();
  const startX = event.clientX;
  const startY = event.clientY;
  const offsetX = event.clientX -
    item.px;
  const offsetY = event.clientY -
    item.py;
  const track: Array<{
    t: number;
    x: number;
    y: number;
  }> = [];
  let moved = false;
  item.dragging = true;
  item.vx = 0;
  item.vy = 0;
  item.el.classList.add('dragging');
  const onPointerMove = (ev: PointerEvent): void => {
    moved ||= Math.hypot(ev.clientX -
      startX, ev.clientY -
    startY,) > 4;
    item.px = clamp(ev.clientX -
      offsetX, 0, Math.max(0, DESK_W -
        item.w,));
    item.py = clamp(ev.clientY -
      offsetY, 0, Math.max(0, DESK_H -
        item.h,));
    item.render();
    track.push({
      t: performance.now(), x: ev.clientX, y: ev.clientY,
    });
    while (track.length > 8) {
      track.shift();
    }
  };
  const onPointerUp = (ev: PointerEvent): void => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    item.dragging = false;
    item.el.classList.remove('dragging');
    if (!moved) {
      (item.constructor as
        typeof Tool
      ).onClick(item, ev);
      item.render();
      return;
    }
    const first = track[0];
    let vx = 0;
    if (first) {
      const dt = (performance.now() -
        first.t
      ) / 1000;
      if (dt > 0.01
      ) {
        vx = (ev.clientX -
          first.x
        ) / dt;
      }
    }
    if ((item.constructor as
      typeof Tool).gravity) {
      item.vx = clamp(vx * 0.9, -2400, 2400);
      item.vy = 0;
      item.grounded = false;
    } else if (!(item instanceof Car && item.running)) {
      item.vx = 0;
      item.vy = 0;
    }
    (item.constructor as
      typeof Tool).onRelease(item);
    item.render();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}
let openItem:
  Tool | null = null;
let openAt = {
  x: 0, y: 0,
};
function openMenu(clientX: number, clientY: number, item: Tool,): void {
  openItem = item;
  openAt = {
    x: clientX, y: clientY,
  };
  menuEl.innerHTML = '';
  menuEl.appendChild((item.constructor as
    typeof Tool).onContextMenu(item,));
  menuEl.classList.add('open');
  menuEl.setAttribute('aria-hidden', 'false');
  placeMenu();
}
function refreshMenu(item: Tool,): void {
  if (openItem !== item) {
    return;
  }
  openMenu(openAt.x, openAt.y, item);
}
function placeMenu(): void {
  menuEl.style.left = '0px';
  menuEl.style.top = '0px';
  const rect = menuEl.getBoundingClientRect();
  let x = openAt.x;
  let y = openAt.y;
  if (x + rect.width > window.innerWidth - 8) {
    x = window.innerWidth -
      rect.width -
      8;
  }
  if (y + rect.height > window.innerHeight - 8) {
    y = window.innerHeight -
      rect.height -
      8;
  }
  menuEl.style.left = `${Math.max(8, x)}px`;
  menuEl.style.top = `${Math.max(8, y)}px`;
}
function closeMenu(): void {
  menuEl.classList.remove('open');
  menuEl.setAttribute('aria-hidden', 'true');
  menuEl.innerHTML = '';
  openItem = null;
}
function menuTitle(text: string,): HTMLElement {
  const el = document.createElement('div');
  el.className = 'menu-title';
  el.textContent = text;
  return el;
}
function delButton(item: Tool,): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'menu-danger';
  button.type = 'button';
  button.textContent = '删除该工具';
  button.addEventListener('click', () => {
    removeItem(item);
    closeMenu();
  });
  return button;
}
function createContextMenu(item: Tool, title = (item.constructor as
  typeof Tool).label,): HTMLDivElement {
  const root = document.createElement('div');
  root.appendChild(menuTitle(title));
  const body = document.createElement('div');
  body.className = 'menu-body';
  root.appendChild(body);
  root.appendChild(delButton(item));
  return root;
}
function menuBody(root: HTMLElement,): HTMLElement {
  return root.querySelector('.menu-body',) as HTMLElement;
}
function button(text: string, onClick: () => void, on = false,): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `menu-btn${on ? ' on' : ''}`;
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
function rowLabel(label: string, value?: string,): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'menu-row';
  const left = document.createElement('span');
  left.className = 'menu-label';
  left.textContent = label;
  row.appendChild(left);
  if (value !== undefined) {
    const right = document.createElement('strong');
    right.className = 'menu-value';
    right.textContent = value;
    row.appendChild(right);
  }
  return row;
}
function rangeControl(min: number, max: number, step: number, value: number, formatter:
  (value: number) => string, onInput:
    (value: number) => void,): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'menu-row';
  const range = document.createElement('input');
  range.className = 'menu-range';
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  const out = document.createElement('strong');
  out.className = 'menu-value';
  out.textContent = formatter(value);
  range.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  range.addEventListener('input', () => {
    const v = Number(range.value);
    out.textContent = formatter(v);
    onInput(v);
  });
  row.append(range, out);
  return row;
}
function buildBoardMenu(item: EchoBoard,): HTMLElement {
  const root = createContextMenu(item, '隔音板');
  const body = menuBody(root);
  const dirRow = rowLabel('方向');
  const dirBtns = document.createElement('div');
  dirBtns.className = 'menu-row';
  dirBtns.append(button('竖 · 占左侧', () => {
    item.dir = 'v';
    item.applyGeom();
    refreshMenu(item);
  }, item.dir === 'v',), button('横 · 占下侧', () => {
    item.dir = 'h';
    item.applyGeom();
    refreshMenu(item);
  }, item.dir === 'h',));
  body.append(dirRow, dirBtns);
  body.appendChild(rowLabel('长度',));
  body.appendChild(rangeControl(3, 24, 1, item.len, (v) => `${Math.round(v)} 格`, (v) => {
    item.len = Math.round(v);
    item.applyGeom();
  },));
  body.appendChild(rowLabel('反射',));
  const reflectRow = document.createElement('div');
  reflectRow.className = 'menu-row';
  reflectRow.append(
    button('开启反射', () => {
      item.reflect = true;
      refreshMenu(item);
    }, item.reflect),
    button('关闭反射', () => {
      item.reflect = false;
      refreshMenu(item);
    }, !item.reflect),
  );
  body.appendChild(reflectRow);
  const note = document.createElement('div');
  note.className = 'menu-note';
  note.textContent = '反射只有开启/关闭两种状态。隔音板命中后只遮挡对应方向，未命中区域继续显示。';
  body.appendChild(note);
  return root;
}
function appendToneControls(body: HTMLElement, item: FrequencySource, options: {
  mode: boolean;
},): void {
  const tone = item as
    TuningFork | Bell;
  if (options.mode) {
    body.appendChild(rowLabel('发声模式',));
    const modeRow = document.createElement('div');
    modeRow.className = 'menu-row';
    modeRow.append(button('点击发声', () => {
      tone.mode = 'click';
      tone.emitTimer = 0;
      tone.vib = Math.min(tone.vib, 0.2);
      refreshMenu(item as Tool);
    }, tone.mode === 'click',), button('持续发声', () => {
      tone.mode = 'continuous';
      tone.emitTimer = 0;
      refreshMenu(item as Tool);
    }, tone.mode === 'continuous',));
    body.appendChild(modeRow);
  }
  body.appendChild(rowLabel('频率（Hz）',));
  const freqRow = document.createElement('div');
  freqRow.className = 'menu-row';
  const input = document.createElement('input');
  input.className = 'menu-input';
  input.type = 'number';
  input.min = String(FREQ_MIN);
  input.max = String(FREQ_MAX);
  input.step = '0.01';
  input.value = item.freq.toFixed(2);
  input.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  input.addEventListener('change', () => {
    setFreq(item, Number(input.value,));
    refreshMenu(item as Tool);
  });
  const down = button('▼', () => {
    stepLevel(item, -1);
    refreshMenu(item as Tool);
  });
  const up = button('▲', () => {
    stepLevel(item, 1);
    refreshMenu(item as Tool);
  });
  freqRow.append(down, input, up);
  body.appendChild(freqRow);
  const info = document.createElement('div');
  info.className = 'menu-note';
  const where = item.level >= 0
    ? `档位 ${item.level} / ${TOP_LEVEL}`
    : '自定义频率';
  info.innerHTML = `${where} · ${item.freq.toFixed(2)} Hz<br>` + `发射间隔 ${waveInterval(item.freq).toFixed(3)} 秒 / 个<br>` + `范围 ${FREQ_MIN} ~ ${FREQ_MAX} Hz`;
  body.appendChild(info);
}
function buildToneMenu(item: TuningFork | Bell, title: string,): HTMLElement {
  const root = createContextMenu(item, title);
  appendToneControls(menuBody(root), item, { mode: true });
  return root;
}
function buildForkMenu(item: TuningFork,): HTMLElement {
  return buildToneMenu(item, '音叉');
}
function buildCarMenu(item: Car,): HTMLElement {
  const root = createContextMenu(item, '小车 · 移动声源');
  const body = menuBody(root);
  body.appendChild(rowLabel('运行状态',));
  const runRow = document.createElement('div');
  runRow.className = 'menu-row';
  runRow.appendChild(button(item.running
    ? '⏹ 停止'
    : '▶ 启动', () => {
      item.running = !item.running;
      item.emitTimer = 0;
      if (item.running
      ) {
        emitWave(item);
      }
      refreshMenu(item);
    }, item.running,));
  body.appendChild(runRow);
  body.appendChild(rowLabel('方向',));
  const dirRow = document.createElement('div');
  dirRow.className = 'menu-row';
  dirRow.append(button('← 向左', () => {
    item.direction = -1;
    refreshMenu(item);
  }, item.direction === -1,), button('→ 向右', () => {
    item.direction = 1;
    refreshMenu(item);
  }, item.direction === 1,));
  body.appendChild(dirRow);
  body.appendChild(rowLabel('速度', `${item.speed.toFixed(1)} ×`,));
  const speedRow = document.createElement('div');
  speedRow.className = 'menu-row';
  const speedOut = document.createElement('strong');
  speedOut.className = 'menu-value';
  speedOut.textContent = `${item.speed.toFixed(1)} ×`;
  const minus = button('− 0.1', () => {
    item.speed = clamp(Math.round((item.speed -
      0.1) * 10,) / 10, 0.1, CAR_SPEED_MAX);
    speedOut.textContent = `${item.speed.toFixed(1)} ×`;
    placeMenu();
  });
  const plus = button('+ 0.1', () => {
    item.speed = clamp(Math.round((item.speed + 0.1) * 10,) / 10, 0.1, CAR_SPEED_MAX);
    speedOut.textContent = `${item.speed.toFixed(1)} ×`;
    placeMenu();
  });
  speedRow.append(minus, speedOut, plus);
  body.appendChild(speedRow);
  appendToneControls(body, item, { mode: false });
  const note = document.createElement('div');
  note.className = 'menu-note';
  note.textContent = `速度 1 = ${CAR_CROSS_TIME.toFixed(0)} 秒横穿整个桌面；启动即发声，移动中持续发出 ${item.freq.toFixed(2)} Hz 声波；到边界自动停止。`;
  body.appendChild(note);
  return root;
}
function setFreq(item: FrequencySource, raw: number,): void {
  let value = Number.isFinite(raw)
    ? raw
    : FREQ_MIN;
  value = clamp(value, FREQ_MIN, FREQ_MAX);
  value = Math.round(value * 100,) / 100;
  item.freq = value;
  item.level = FREQ_TABLE.findIndex((v) => Math.abs(v - value,) < 0.005);
}
function stepLevel(item: FrequencySource, direction: -1 | 1,): void {
  const cur = item.freq;
  if (direction > 0) {
    const next = FREQ_TABLE.find((v) => v > cur + 1e-6);
    setFreq(item, next ??
      FREQ_MAX);
    return;
  }
  let prev:
    number | null = null;
  for (const value of FREQ_TABLE) {
    if (value <
      cur - 1e-6) {
      prev = value;
    }
  }
  setFreq(item, prev ??
    FREQ_MIN);
}
function removeItem(item: Tool,): void {
  const index = items.indexOf(item);
  if (index >= 0) {
    items.splice(index, 1);
  }
  item.remove();
}
function clearDesk(): void {
  while (items.length) {
    removeItem(items[
      items.length - 1
    ]);
  }
  waves = [];
  closeMenu();
}

const INITIAL_CONFIG = {
  version: 10, grid: 24, samples: 512, desk: { w: 1920, h: 816, },
  items: [
    {
      type: 'EchoBoard', x: 22, y: 4, dir: 'v', len: 12, reflect: true,
    }, {
      type: 'EchoBoard', x: 22, y: 17, dir: 'v', len: 12, reflect: true,
    }, {
      type: 'Bell', x: 16, y: 16, freq: 158.49, mode: 'click',
    },],
} as const;

function resetDesk(): void {
  loadConfig(INITIAL_CONFIG);
}

function exportConfig(): void {
  const cfg = {
    version: 10, grid: GRID, samples: SAMPLES, desk: {
      w: DESK_W, h: DESK_H,
    }, items:
      items.map((item) => item.serialize(),),
  };
  const blob = new Blob([
    JSON.stringify(cfg, null, 2,),], {
    type:
      'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wave-lab.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
function loadConfig(cfg: unknown,): void {
  if (!cfg || typeof cfg !== 'object') {
    return;
  }
  const data = cfg as {
    samples?: unknown;
    items?: unknown;
  };
  if (!Array.isArray(data.items,)) {
    return;
  }
  clearDesk();
  if (typeof data.samples === 'number') {
    setSampleDensity(data.samples);
  }
  for (const raw of data.items) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const d = raw as SerializedItem;
    let C = TOOL_BY_NAME[
      d.type
    ];
    if (d.type === 'SoundBoard' || d.type === 'EchoBoard') {
      C = EchoBoard;
    }
    if (!C) continue;
    const item = new C(typeof d.x === 'number'
      ? d.x
      : 0, typeof d.y === 'number'
      ? d.y
      : 0);
    item.deserialize(d);
    items.push(item);
  }
}
// ============================================================// 事件 / 主循环
// ============================================================
pauseBtn.addEventListener('click', () => { togglePause(); });
$('btn-reset').addEventListener('click', resetDesk);
$('btn-export').addEventListener('click', exportConfig);
$('btn-import').addEventListener('click', () => {
  fileIn.click();
});
sampleRange.addEventListener('input', () => {
  setSampleDensity(Number(sampleRange.value,));
});
fileIn.addEventListener('change', () => {
  const file = fileIn.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadConfig(JSON.parse(String(reader.result,),));
    } catch (error) {
      console.warn('配置解析失败', error);
    }
  };
  reader.readAsText(file);
  fileIn.value = '';
});
window.addEventListener('keydown', (event) => {
  const target = event.target as
    HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    togglePause();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (menuEl.classList.contains('open',) && !menuEl.contains(event.target as Node,)) {
    closeMenu();
  }
});
deskEl.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  layout();
  for (const item of items) {
    item.render();
  }
});
function togglePause(): void {
  paused = !paused;
  pauseBtn.textContent = paused
    ? '▶ 继续' : '⏸ 暂停';
  pauseBtn.classList.toggle('on', paused);
}
function boot(): void {
  sampleRange.min = '256';
  sampleRange.max = '2048';
  sampleRange.step = '64';
  layout();
  buildToolbar();
  loadConfig(INITIAL_CONFIG);
  sampleVal.textContent = String(SAMPLES);
  requestAnimationFrame(frame);
}
let lastTime = performance.now();
function frame(now: number,): void {
  let dt = (now - lastTime) /
    1000;
  lastTime = now;
  if (!(dt > 0)) {
    dt = 0;
  }
  dt = Math.min(dt, MAX_DT);
  if (!paused) {
    for (const item of items) {
      item.update(dt);
    }
    updateWaves(dt);
  }
  renderWaves();
  requestAnimationFrame(frame);
}
boot();

(window as Window & {
  TuningForkLab?: unknown;
}).TuningForkLab = {
  Tool, TuningFork, EchoBoard, SoundBoard, SmallTable, Bell, Car, registerTool, items, GRID, setSampleDensity, get samples() {
    return SAMPLES;
  }, get waves() {
    return waves;
  },
};
