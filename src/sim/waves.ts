// 波形本身：创建、发射、二级波（反射 / 衍射）、生命周期推进。

import {
  GRID,
  WAVE_FADE_DURATION,
  WAVE_COUNT_THROTTLE_START,
  WAVE_COUNT_THROTTLE_STRICT,
  MAX_TRAVEL_DISTANCE,
} from '../core/constants';
import { freqHue } from '../core/frequency';
import { circleSegmentIntersections, reflectPointAcrossLine } from '../core/math';
import type { Point, Occluder, Wave, DiffractionInfo } from '../core/types';
import { state } from '../state';
import { collectOccluders } from './occluders';
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

export function makeWave(position: Point, freq: number): Wave {
  return {
    position: position,
    r: 0,
    hue: freqHue(freq),
    freq,
    travelDistance: 0,
    source: position,
    reflections: [],
    birthR: 0,
    diffractionInfo: null,
    diffraction: null,
    fadeOut: 1,
    skipTag: false,
    emittedReflections: new Set(),
    emittedDiffractions: new Set(),
  };
}

export function makeSubWave(position: Point,
  parent: Wave,

): Wave {
  return {
    position: position,
    r: 0,
    hue: parent.hue,
    freq: parent.freq,
    travelDistance: parent.travelDistance + parent.r,
    source: position,
    reflections: [],
    birthR: 0,
    diffractionInfo: null,
    diffraction: null,
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
  // if (parent.reflections.some((hop) => hop.occ.key === o.key)) { return null; }
  const last = parent.reflections.length
  if (last > 0 && parent.reflections[last - 1].occ.key === o.key) { return null; }
  const position = reflectPointAcrossLine(parent.position, o.seg);
  const next = makeSubWave(position, parent);
  next.r = parent.r;
  next.source = parent.source;
  next.reflections.push(...parent.reflections, { occ: o, bounce: bounce });
  return next;
}

export function isInvalidDiffractionPoint(
  p: Point,
  wave: Wave,
): boolean {
  const info = wave.diffractionInfo;
  if (!info) return false;
  const { edge, abX, abY, ae1X, ae1Y, crossAB_AE1 } = info;
  if (Math.abs(crossAB_AE1) <= 1e-9) { return false; }
  const apX = p[0] - edge[0];
  const apY = p[1] - edge[1];
  const crossAB_AP = abX * apY - abY * apX;
  const crossAE1_AP = ae1X * apY - ae1Y * apX;
  return (crossAB_AE1 * crossAB_AP >= 0 && crossAB_AE1 * crossAE1_AP <= 0);
}

function createDiffractionInfo(
  o: Occluder,
  edgeIndex: number,
  edge: Point,
  incidentSource: Point,
  parent: Wave,
): DiffractionInfo {
  const [aX, aY] = edge;
  const [bX, bY] = o.seg[1 - edgeIndex];
  const [eX, eY] = incidentSource;
  const abX = bX - aX;
  const abY = bY - aY;
  const aeX = eX - aX;
  const aeY = eY - aY;
  const denom = abX * abX + abY * abY;
  const t = denom > 1e-12 ? (aeX * abX + aeY * abY) / denom : 0;
  const e1X = eX - 2 * t * abX;
  const e1Y = eY - 2 * t * abY;
  const ae1X = e1X - aX;
  const ae1Y = e1Y - aY;
  const crossAB_AE1 = abX * ae1Y - abY * ae1X;
  const aeL = Math.sqrt(aeX * aeX + aeY * aeY) || 1;
  const aeXu = aeX / aeL;
  const aeYu = aeY / aeL;
  const beX = eX - bX
  const beY = eY - bY;
  const beL = Math.sqrt(beX * beX + beY * beY) || 1;
  return {
    board: o,
    edgeIndex,
    edge,
    incidentSource,
    parent,
    abX,
    abY,
    ae1X,
    ae1Y,
    crossAB_AE1,
    aeXu,
    aeYu,
    beL
  };
}
/** 由一条边生成衍射子波：以边缘为新的点源。 */
function createDiffractionWave(parent: Wave, o: Occluder, edgeIndex: number, incidentSource: Point): Wave | null {
  const edge = o.seg[edgeIndex];
  const [ax, ay] = o.seg[0];
  const [x, y] = parent.position;
  if (Math.abs((x - ax) * o.nx + (y - ay) * o.ny) < 0.5) { return null; }
  if (isInvalidDiffractionPoint(edge, parent)) { return null; }
  const next = makeSubWave(edge, parent);
  next.diffractionInfo = createDiffractionInfo(o, edgeIndex, edge, incidentSource, parent);
  parent.diffraction = next;
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
        wave.diffraction?.emittedReflections.add(k);
        wave.diffractionInfo?.parent.emittedReflections.add(k);
        break;
      }
    }
  }
  // -------------------------
  // 衍射
  // -------------------------
  const lastkey = wave.reflections[wave.reflections.length - 1]?.occ.key;
  const [sx, sy] = wave.position;
  const rSq = wave.r * wave.r;
  for (const [k, o] of state.occluders) {
    if (wave.emittedDiffractions.has(k)) { continue; }
    if (lastkey === k) { continue; }
    for (const i of [0, 1]) {
      if (!o.diffraction[i]) { continue; }
      const [x, y] = o.seg[i];
      const key = `${x},${y}`;
      if (wave.emittedDiffractions.has(key)) { continue; }
      const dx = x - sx;
      const dy = y - sy;
      if (rSq < dx * dx + dy * dy - 1e-3) { continue; }
      const path = getWavePathToPoint(wave, o.seg[i], k);
      if (!path) continue;
      const incidentSource = getIncidentSource(wave, path);
      const child = createDiffractionWave(wave, o, i, incidentSource);
      if (!child) continue;
      wave.emittedDiffractions.add(key);
      wave.diffraction?.emittedDiffractions.add(key);
      wave.diffractionInfo?.parent.emittedDiffractions.add(key);
      push(child);
    }
  }
}

export function updateWaves(dt: number): void {
  if (!state.waves.length) return;
  if (state.occStale) { collectOccluders(); }
  for (let i = state.waves.length - 1; i >= 0; i -= 1) {
    const wave = state.waves[i];
    wave.r += state.waveSpeed * dt;
    if (wave.travelDistance + wave.r > MAX_TRAVEL_DISTANCE) {
      wave.fadeOut -= dt / WAVE_FADE_DURATION;
      if (wave.fadeOut < 0) { state.waves.splice(i, 1); }
      continue;
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
