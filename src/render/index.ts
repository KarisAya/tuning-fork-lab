// 波的绘制：直接波用软边可见度，二级波用几何路径采样。
import { RENDER_SAMPLES, SECONDARY_RENDER_SAMPLES, TAU, WAVE_LW, MIN_WAVE_EFFECTIVE_ALPHA } from '../core/constants';
import type { Point, Wave } from '../core/types';
import { state } from '../core/state';
import { diffractionPositionFactor, diffractionAngleFactor, buildOccluderCache, directVisibility, getWavePathToPoint, segmentBlockedByBoards, } from './optics';
import { renderWaveAlpha } from './wave';
import { waveCtx } from '../ui/dom';

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
function getStrokeColor(
  hue: string,
  sat: number,
  light: number,
  alpha: number,
): string {
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
function circleRingIntersectsViewport(
  c: Point,
  r: number,
  w: number,
  h: number,
): boolean {
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
function strokeArcRuns(
  c: Point,
  r: number,
  runs: ArcRun[],
  hue: string,
  sat: number,
  light: number,
): void {
  const cx = c[0];
  const cy = state.deskH - c[1];
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
    if (arcs.length === 0) { continue; }
    const alpha = key * ALPHA_STEP;
    if (alpha < MIN_WAVE_EFFECTIVE_ALPHA) { continue; }
    waveCtx.strokeStyle = getStrokeColor(hue, sat, light, alpha);
    waveCtx.beginPath();
    for (let i = 0; i < arcs.length; i += 1) {
      const arc = arcs[i];
      const c0 = fastCos(arc.a0);
      const s0 = fastSin(arc.a0);
      // 世界坐标 Y 向上 → Canvas Y 向下
      waveCtx.moveTo(cx + c0 * r, cy - s0 * r);
      // 世界角度逆时针 → Canvas 中反向
      waveCtx.arc(cx, cy, r, -arc.a0, -arc.a1, true,);
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
    if (runStart < 0) {
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

/**
 * 反射波仍使用几何路径判断，但把采样按弧长自适应，
 * 并在连续同 alpha 区间内合批绘制。
 *
 * 关键是：反射波不再依赖一个可能在某帧全部变空的 run，
 * 同时把每个小弧段一次 stroke 的开销降下来。
 */
// function drawReflectedWave(wave: Wave, baseAlpha: number): void {
//   if (wave.r <= 0.5) return;

//   const steps = sampleCountForRadius(wave.r, SECONDARY_RENDER_SAMPLES);
//   const stepAngle = TAU / steps;
//   const hue = wave.hue.toFixed(1);

//   const runs: ArcRun[] = [];
//   let runStart = -1;
//   let runEnd = 0;
//   let runAlpha = 0;

//   const flush = (): void => {
//     if (runStart < 0) return;
//     runs.push({ a0: runStart, a1: runEnd, alpha: runAlpha });
//     runStart = -1;
//   };

//   for (let i = 0; i < steps; i += 1) {
//     const a0 = i * stepAngle;
//     const a1 = a0 + stepAngle;
//     const am = (a0 + a1) * 0.5;

//     const target: Point = [wave.x + fastCos(am) * wave.r, wave.y + fastSin(am) * wave.r];
//     if (getWavePathToPoint(wave, target) === null) {
//       const near0: Point = [wave.x + fastCos(am - stepAngle) * wave.r, wave.y + fastSin(am - stepAngle) * wave.r];
//       if (getWavePathToPoint(wave, near0) === null) {
//         const near1: Point = [wave.x + fastCos(am + stepAngle) * wave.r, wave.y + fastSin(am + stepAngle) * wave.r];
//         if (getWavePathToPoint(wave, near1) === null) {
//           flush();
//           continue;
//         }
//       }
//     }
//     const quantizedAlpha = Math.round(baseAlpha * ALPHA_INV) * ALPHA_STEP;
//     if (runStart < 0) {
//       runStart = a0;
//       runEnd = a1;
//       runAlpha = quantizedAlpha;
//     } else if (Math.abs(quantizedAlpha - runAlpha) <= ALPHA_STEP) {
//       runEnd = a1;
//     } else {
//       flush();
//       runStart = a0;
//       runEnd = a1;
//       runAlpha = quantizedAlpha;
//     }
//   }
//   flush();
//   strokeArcRuns(wave.x, wave.y, wave.r, runs, hue, 90, 66);
// }

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
        const an = - stepAngle / 2;
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

function drawDiffractionWave(wave: Wave, baseAlpha: number): void {
  const info = wave.diffractionInfo;
  if (!info || wave.r <= 0.5) return;
  tmpIgnore.clear();
  tmpIgnore.add(info.board.key);
  const ignore = tmpIgnore;
  const steps = sampleCountForRadius(wave.r, SECONDARY_RENDER_SAMPLES);
  const stepAngle = TAU / steps;
  const hue = wave.hue.toFixed(1);
  const { edge, abX, abY, ae1X, ae1Y, crossAB_AE1, aeXu, aeYu, beL } = info;
  const [aX, aY] = edge
  // ---- 每波常量：位置项 ----
  const positionFactor = diffractionPositionFactor(beL, wave.r);
  // ---- 每波常量：板身楔形几何 ----
  const hasWedge = Math.abs(crossAB_AE1) > 1e-9;
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
  for (let k = 0; k < steps; k += 1) {
    const a0 = k * stepAngle;
    const a1 = a0 + stepAngle;
    const am = a0 + stepAngle * 0.5;
    const cam = fastCos(am);
    const sam = fastSin(am);
    // 板身楔形剔除：vecAP = (cam * radius, sam * radius)，
    // radius > 0 只判符号，省两次乘法。
    if (hasWedge) {
      const crossAB_AP = abX * sam - abY * cam;
      const crossAE1_AP = ae1X * sam - ae1Y * cam;
      if (crossAB_AE1 * crossAB_AP >= 0 && crossAB_AE1 * crossAE1_AP <= 0) {
        flush();
        continue;
      }
    }
    const p = [aX + cam * radius, aY + sam * radius] as Point;
    if (segmentBlockedByBoards(edge, p, ignore)) { flush(); continue; }
    const angleFactor = diffractionAngleFactor(edge, aeXu, aeYu, p);
    const alpha = Math.sqrt(positionFactor * angleFactor * baseAlpha);
    const quantizedAlpha = Math.round(alpha * ALPHA_INV) * ALPHA_STEP;
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
  strokeArcRuns(info.edge, radius, runs, hue, 90, 66);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function renderWaves(): void {
  waveCtx.clearRect(0, 0, state.deskW, state.deskH);
  waveCtx.lineWidth = WAVE_LW;
  waveCtx.lineCap = 'round';
  waveCtx.lineJoin = 'round';

  const w = state.deskW;
  const h = state.deskH;

  // 单次遍历收集三类波，避免重复调用 renderWaveAlpha 和重复分支判断。
  const directWaves: Array<[Wave, number]> = [];
  const reflectedWaves: Array<[Wave, number]> = [];
  const diffractionWaves: Array<[Wave, number]> = [];

  for (const wave of state.waves) {
    const alpha = renderWaveAlpha(wave);
    if (!circleRingIntersectsViewport(wave.position, wave.r, w, h)) continue;
    if (wave.reflections.length > 0) { reflectedWaves.push([wave, alpha]); }
    else if (wave.diffractionInfo) { diffractionWaves.push([wave, alpha]); }
    else { directWaves.push([wave, alpha]); }
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

