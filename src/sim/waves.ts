// 波形本身：创建、发射、二级波（反射 / 衍射）、生命周期推进。

import {
  GRID,
  MIN_WAVE_EFFECTIVE_ALPHA,
  WAVE_FADE_DURATION,
  WAVE_COUNT_LIMIT_THRESHOLD,
} from '../core/constants';
import { freqHue } from '../core/frequency';
import {
  circleSegmentIntersections,
  pointSegmentDistanceSquared,
  reflectPointAcrossLine,
} from '../core/geometry';
import { clamp } from '../core/math';
import type { Emitter, Occluder, Point, Segment, Wave } from '../core/types';
import { state } from '../state';
import { collectOccluders } from './occluders';
import { getIncidentSource, getWavePathToPoint } from './optics';

/** 2D 圆柱波近似：1/sqrt(r)。 */
export function waveAlphaAt(radius: number): number {
  const rGrid = Math.max(1, radius / GRID);
  return clamp(1 / Math.sqrt(rGrid), 0, 1);
}

export function effectiveWaveAlpha(wave: Wave): number {
  return waveAlphaAt(wave.r);
}

export function renderWaveAlpha(wave: Wave): number {
  return effectiveWaveAlpha(wave) * wave.fadeOut;
}

export function makeWave(
  x: number,
  y: number,
  freq: number,
  radius = 0,
  travelDistance = 0,
): Wave {
  return {
    x,
    y,
    r: radius,
    hue: freqHue(freq),
    freq,
    travelDistance,
    sourceX: x,
    sourceY: y,
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

export function emitWaveAt(x: number, y: number, freq: number): void {
  pushWave(makeWave(x, y, freq));
}

export function emitWave(item: Emitter): void {
  const source = item.getEmissionPoint();
  emitWaveAt(source[0], source[1], item.freq);
}

/** 由一次命中生成反射子波：镜像发射点 + 展开路径。 */
function createReflectedWave(parent: Wave, o: Occluder, bounce: Point): Wave | null {
  if (parent.reflections.some((hop) => hop.item === o.item)) {
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
    ...parent.reflections,
    { item: o.item, seg: [...o.seg] as Segment, bounce: [bounce[0], bounce[1]] },
  ];
  next.birthR = parent.r;
  next.diffraction = null;
  next.diffractionDepth = parent.diffractionDepth;
  return next;
}

/** 由一条边生成衍射子波：以边缘为新的点源。 */
function createDiffractionWave(
  parent: Wave,
  o: Occluder,
  edgeIndex: number,
  incidentSource: Point,
): Wave | null {
  const edge = o.ends[edgeIndex];
  const source: Point = [parent.x, parent.y];
  const sideSign = (source[0] - o.seg[0]) * o.nx + (source[1] - o.seg[1]) * o.ny;
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
    board: o.item,
    edgeIndex,
    edge: [edge[0], edge[1]],
    incidentSource: [incidentSource[0], incidentSource[1]],
  };
  next.diffractionDepth = parent.diffractionDepth + 1;
  return next;
}

function spawnSecondaryWaves(wave: Wave, push = pushWave): void {
  // if (wave.reflections.length > MAX_REFLECTION_DEPTH) return;
  // if (wave.diffractionDepth > MAX_DIFFRACTION_DEPTH) return;
  // -------------------------
  // 反射
  // -------------------------
  for (const o of state.occluders) {
    if (wave.emittedReflections.has(o.item)) {
      continue;
    }
    if (wave.diffraction?.board === o.item) {
      continue;
    }
    const minDist2 = pointSegmentDistanceSquared(wave.x, wave.y, o.seg);
    if (wave.r * wave.r < minDist2 - 1e-3) {
      continue;
    }
    const hits = circleSegmentIntersections(wave.x, wave.y, wave.r, o.seg);
    for (const hit of hits) {
      const path = getWavePathToPoint(wave, hit, o.item);
      if (!path) continue;
      const bounce = path[path.length - 1];
      const reflected = createReflectedWave(wave, o, bounce);
      if (reflected) {
        push(reflected);
        wave.emittedReflections.add(o.item);
        break;
      }
    }
  }
  // -------------------------
  // 衍射
  // -------------------------
  for (const o of state.occluders) {
    if (wave.diffraction?.board === o.item) {
      continue;
    }
    const lastReflection = wave.reflections[wave.reflections.length - 1];
    if (lastReflection?.item === o.item) {
      continue;
    }
    for (let edgeIndex = 0; edgeIndex < o.ends.length; edgeIndex += 1) {
      const key = `${o.key}:${edgeIndex}`;
      if (wave.emittedDiffractions.has(key)) {
        continue;
      }
      const edge = o.ends[edgeIndex];
      const dist = Math.hypot(edge[0] - wave.x, edge[1] - wave.y);
      if (wave.r + 1e-3 < dist) {
        continue;
      }
      const path = getWavePathToPoint(wave, edge, o.item);
      if (!path) continue;
      const incidentSource = getIncidentSource(wave, path);
      const child = createDiffractionWave(wave, o, edgeIndex, incidentSource);
      if (!child) continue;
      wave.emittedDiffractions.add(key);
      push(child);
    }
  }
}



export function updateWaves(dt: number): void {
  if (!state.waves.length) return;
  collectOccluders();
  for (let i = state.waves.length - 1; i >= 0; i -= 1) {
    const wave = state.waves[i];
    wave.r += state.waveSpeed * dt;
    // 一旦波弱到不值得继续做反射/衍射计算，立即停止二级波生成，
    // 但不要立即删除。保留一个短暂的淡出阶段，让动画连续。
    if (wave.r > state.maxR || effectiveWaveAlpha(wave) < MIN_WAVE_EFFECTIVE_ALPHA) {
      wave.fadeOut = Math.max(0, wave.fadeOut - dt / WAVE_FADE_DURATION);
    } else {
      wave.fadeOut = 1;
    }
    if (wave.fadeOut < 1) { if (wave.fadeOut < MIN_WAVE_EFFECTIVE_ALPHA) { state.waves.splice(i, 1); } continue; }
    if (wave.skipTag) continue;
    const waveCount = state.waves.length
    if (waveCount < WAVE_COUNT_LIMIT_THRESHOLD || !(i % Math.ceil(waveCount / WAVE_COUNT_LIMIT_THRESHOLD))) { spawnSecondaryWaves(wave); }
    else { spawnSecondaryWaves(wave, (wave) => { wave.skipTag = true, pushWave(wave) }); }
  }
  return;
}
