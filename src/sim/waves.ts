// 波形本身：创建、发射、二级波（反射 / 衍射）、生命周期推进。

import {
  GRID,
  MIN_WAVE_EFFECTIVE_ALPHA,
  WAVE_FADE_DURATION,
  WAVE_COUNT_THROTTLE_START,
  WAVE_COUNT_THROTTLE_STRICT,
  MAX_TRAVEL_DISTANCE,
} from '../core/constants';
import { freqHue } from '../core/frequency';
import { clamp, distanceSquarePointSegment, circleSegmentIntersections, reflectPointAcrossLine } from '../core/math';
import type { Point, Segment, Occluder, Wave } from '../core/types';
import { state } from '../state';
import { collectOccluders, isPointOnSegment } from './occluders';
import { getIncidentSource, getWavePathToPoint } from './optics';

/** 2D 圆柱波近似：1/sqrt(r)。 */
export function waveAlphaAt(radius: number): number {
  if (radius < 1) { return 0; }
  return 1 / Math.sqrt(radius / GRID)
}
export function renderWaveAlpha(wave: Wave): number {
  const alpha = waveAlphaAt(wave.r) * wave.fadeOut;
  return wave.skipTag ? alpha * 0.5 : alpha;
}

export function makeWave(
  position: Point,
  freq: number,
  radius = 0,
  travelDistance = 0,
  source: Point | null = null
): Wave {
  return {
    position: position,
    r: radius,
    hue: freqHue(freq),
    freq,
    travelDistance,
    source: source || position,
    reflections: [],
    birthR: radius,
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
export function emitWaveAt(source: Point, freq: number): void {
  pushWave(makeWave(source, freq));
}
/** 由一次命中生成反射子波：镜像发射点 + 展开路径。 */
function createReflectedWave(parent: Wave, o: Occluder, bounce: Point): Wave | null {
  if (!o.reflect) { return null; }
  if (parent.reflections.some((hop) => hop.occ.key === o.key)) { return null; }
  const nextTravelDistance = parent.travelDistance + parent.r;
  const position = reflectPointAcrossLine(parent.position, o.seg);
  const next = makeWave(position, parent.freq, parent.r, nextTravelDistance, parent.source);
  next.reflections.push(...parent.reflections, { occ: o, bounce: [bounce[0], bounce[1]] });
  next.diffractionDepth = parent.diffractionDepth;
  return next;
}

/** 由一条边生成衍射子波：以边缘为新的点源。 */
function createDiffractionWave(parent: Wave, o: Occluder, edgeIndex: number, incidentSource: Point,): Wave | null {
  const edge = o.seg[edgeIndex];
  const nextTravelDistance = parent.travelDistance + parent.r;
  const next = makeWave(edge, parent.freq, 0, nextTravelDistance);
  next.hue = parent.hue;
  next.source = [...edge]
  next.reflections = [];
  next.birthR = 0;
  next.diffraction = { board: o, edgeIndex, edge: [edge[0], edge[1]], incidentSource: [incidentSource[0], incidentSource[1]] };
  next.diffractionDepth = parent.diffractionDepth + 1;
  return next;
}


function spawnSecondaryWaves(wave: Wave, push = pushWave): void {
  // if (wave.reflections.length > MAX_REFLECTION_DEPTH) return;
  // if (wave.diffractionDepth > MAX_DIFFRACTION_DEPTH) return;
  // -------------------------
  // 反射
  // -------------------------
  for (const [k, o] of state.occluders) {
    if (!o.reflect) { continue; }
    if (wave.emittedReflections.has(k)) { continue; }
    if (wave.diffraction?.board.key === k) { continue; }
    // if (wave.r * wave.r < distanceSquarePointSegment(wave.position, o.seg) - 1e-3) { continue; }
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
  // const lastReflection = wave.reflections[wave.reflections.length - 1];
  // const [sx, sy] = wave.position;
  // const rSq = wave.r * wave.r;
  // for (const [k, o] of state.occluders) {
  //   if (wave.diffraction?.board === o) { continue; }
  //   if (lastReflection?.occ === o) { continue; }
  //   // if (isPointOnSegment(wave.position, o.seg)) { continue; }
  //   for (const i of [0, 1]) {
  //     if (!o.diffraction[i]) { continue; }
  //     const key = `${k}:${i}`;
  //     if (wave.emittedDiffractions.has(key)) { continue; }
  //     const [x, y] = o.seg[i];
  //     const dx = x - sx;
  //     const dy = y - sy;
  //     if (rSq < dx * dx + dy * dy - 1e-3) { continue; }
  //     const path = getWavePathToPoint(wave, o.seg[i], k);
  //     if (!path) continue;
  //     const incidentSource = getIncidentSource(wave, path);
  //     const child = createDiffractionWave(wave, o, i, incidentSource);
  //     if (!child) continue;
  //     wave.emittedDiffractions.add(key);
  //     push(child);
  //   }
  // }
}


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
    }
    else {
      wave.fadeOut = 1;
    }
    if (wave.skipTag) continue;
    const waveCount = state.waves.length
    if (waveCount > WAVE_COUNT_THROTTLE_STRICT) {
      if (i % Math.ceil(waveCount / WAVE_COUNT_THROTTLE_STRICT)) { continue; }
      else { spawnSecondaryWaves(wave, pushSkipWave); }
    }
    else if (waveCount > WAVE_COUNT_THROTTLE_START &&
      (i % Math.ceil(waveCount / WAVE_COUNT_THROTTLE_START))
    ) { spawnSecondaryWaves(wave, pushSkipWave); }
    else { spawnSecondaryWaves(wave); }
  }
  return;
}
