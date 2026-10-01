// 波的绘制：直接波用软边可见度，二级波用几何路径采样。

import { DIFF_MIN_ALPHA, MIN_DRAW_ALPHA, RENDER_SAMPLES, SECONDARY_RENDER_SAMPLES, TAU, WAVE_LW, WAVE_REMOVE_ALPHA } from '../core/constants';
import type { Point, Wave, WaveObstacle } from '../core/types';
import { getOccluder } from '../sim/occluders';
import { diffractionEnvelope, directVisibility, reflectionVisibility, segmentBlockedByBoards } from '../sim/optics';
import { renderWaveAlpha } from '../sim/waves';
import { state } from '../state';
import { waveCtx } from '../ui/dom';

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
  const samples = Math.min(RENDER_SAMPLES, Math.max(256, Math.ceil(wave.r / 2)));
  const hue = wave.hue.toFixed(1);
  const ALPHA_STEP = 0.04;
  let runStart = -1;
  let runAlpha = 0;
  const flush = (endIndex: number): void => {
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
function drawReflectedWave(wave: Wave, baseAlpha: number): void {
  if (wave.r <= 0.5) return;
  const steps = SECONDARY_RENDER_SAMPLES;
  const hue = wave.hue.toFixed(1);
  for (let i = 0; i < steps; i += 1) {
    const a0 = i / steps * TAU;
    const a1 = (i + 1) / steps * TAU;
    const am = (a0 + a1) * 0.5;
    const target: Point = [
      wave.x + Math.cos(am) * wave.r,
      wave.y + Math.sin(am) * wave.r,
    ];
    let visible = reflectionVisibility(wave, target);
    if (visible === 0) {
      const near0: Point = [
        wave.x + Math.cos(am - TAU / steps) * wave.r,
        wave.y + Math.sin(am - TAU / steps) * wave.r,
      ];
      const near1: Point = [
        wave.x + Math.cos(am + TAU / steps) * wave.r,
        wave.y + Math.sin(am + TAU / steps) * wave.r,
      ];
      if (reflectionVisibility(wave, near0) || reflectionVisibility(wave, near1)) {
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
  if (!info || wave.r <= 0.5) return;
  const boardOcc = getOccluder(info.board);
  if (!boardOcc) return;
  const ignore = new Set<WaveObstacle>([info.board]);
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
    // 板子自身占用的楔形区域不画，避免波「穿过」板身。
    if (hasWedge) {
      const vecAPX = px - aX;
      const vecAPY = py - aY;
      const crossAB_AP = vecABX * vecAPY - vecABY * vecAPX;
      const crossAE1_AP = vecAE1X * vecAPY - vecAE1Y * vecAPX;
      if (crossAB_AE1 * crossAB_AP >= 0 && crossAB_AE1 * crossAE1_AP <= 0) continue;
    }
    const target: Point = [px, py];
    if (segmentBlockedByBoards(info.edge, target, ignore)) continue;

    const localGain = diffractionEnvelope(boardOcc, info.edge, info.incidentSource, target, wave.r);
    const a = baseAlpha * localGain;
    if (a < DIFF_MIN_ALPHA) continue;

    waveCtx.strokeStyle = `hsla(${hue},92%,74%,${a.toFixed(3)})`;
    waveCtx.beginPath();
    waveCtx.arc(aX, aY, wave.r, a0, a1);
    waveCtx.stroke();
  }
}

export function renderWaves(): void {
  waveCtx.clearRect(0, 0, state.deskW, state.deskH);
  waveCtx.lineWidth = WAVE_LW;
  waveCtx.lineCap = 'round';
  waveCtx.lineJoin = 'round';
  // 第一遍绘制主波：直接波永远先建立完整的视觉连续性。
  for (const wave of state.waves) {
    const alpha = renderWaveAlpha(wave);
    if (alpha < WAVE_REMOVE_ALPHA) {
      continue;
    }
    if (wave.reflections.length === 0 && !wave.diffraction) {
      drawDirectWave(wave, alpha);
    }
  }
  // 第二遍绘制二级波：单独一层可以避免 drawDirectWave 的 strokeStyle 改变影响后续波。
  for (const wave of state.waves) {
    const alpha = renderWaveAlpha(wave);
    if (alpha < WAVE_REMOVE_ALPHA) {
      continue;
    }
    if (wave.reflections.length > 0) {
      drawReflectedWave(wave, alpha);
    } else if (wave.diffraction) {
      drawDiffractionWave(wave, alpha);
    }
  }
}
