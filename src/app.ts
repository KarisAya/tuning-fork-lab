// 事件绑定与主循环。应用的入口逻辑在 main.ts 调用 boot() 时启动。
import { CONFIG_VERSION, GRID, WAVE_SPEED, MAX_DT, SAMPLE_MAX, SAMPLE_MIN, DEFAULT_SAMPLES, SAMPLE_STEP } from './core/constants';
import type { Config } from './core/types';
import { state } from './core/state';
import { renderWaves, updateWaves } from './render/';
import { TOOL_REGISTRY } from './tools/manager';
import { canvas, waveCtx, deskEl, toolsEl, menuEl, settingsBtn, settingsPanel, sampleRange } from './ui/dom';
import { closeSettings, togglePause, loadConfig, setupBtn, isMenuOpen, appendToolItem } from './ui/';
import { closeMenu } from './ui/menu';

const INITIAL_CONFIG: Config = {
  version: CONFIG_VERSION,
  samples: DEFAULT_SAMPLES,
  waveSpeed: WAVE_SPEED,
  items: [
    { "type": "BouncyBall", "x": 5, "y": 11, "freq": 55, "mode": "click", "bounceFactor": 1, "frictionFactor": 0.8 },
    { "type": "SmallTable", "x": 11, "y": 0, "gw": 1, "gh": 6 },
    { "type": "SmallTable", "x": 0, "y": 6, "gw": 12, "gh": 1 },
    { "type": "SmallTable", "x": 0, "y": 0, "gw": 1, "gh": 6 },
    { "type": "EchoBoard", "x": 12, "y": 2, "dir": "v", "len": 5, "reflect": true },
    { "type": "EchoBoard", "x": 12, "y": 8, "dir": "v", "len": 5, "reflect": true },
    { "type": "TuningFork", "x": 0, "y": 7, "freq": 440, "mode": "click" },
    { "type": "Car", "x": 9, "y": 7, "freq": 440, "mode": "click", "speed": 1 },
  ]
}
function layout(): void {
  const rect = deskEl.getBoundingClientRect();
  state.deskW = Math.max(1, Math.floor(rect.width));
  state.deskH = Math.max(1, Math.floor(rect.height));
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  deskEl.style.backgroundSize = `${GRID}px ${GRID}px, ${GRID}px ${GRID}px`;
  const pixelWidth = Math.max(1, Math.floor(state.deskW * state.dpr));
  const pixelHeight = Math.max(1, Math.floor(state.deskH * state.dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  waveCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  for (const item of state.items) { item.keepInsideDesk(); }
}

export function boot(): void {
  state.paused = false;
  sampleRange.min = String(SAMPLE_MIN);
  sampleRange.max = String(SAMPLE_MAX);
  sampleRange.step = String(SAMPLE_STEP);
  layout();
  setupBtn();
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) { return; }
    if (event.code === 'Space') {
      event.preventDefault();
      togglePause();
    }
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as Node;
      if (isMenuOpen() && !menuEl.contains(target)) { closeMenu(); }
      if (settingsPanel.classList.contains("open") && !settingsPanel.contains(target) && !settingsBtn.contains(target)) { closeSettings(); }
    }
  );
  deskEl.addEventListener('contextmenu', (event) => event.preventDefault());
  const resizeObserver = new ResizeObserver(() => {
    layout();
    for (const item of state.items) { item.render(); }
  });
  resizeObserver.observe(deskEl);
  toolsEl.innerHTML = '';
  for (const C of TOOL_REGISTRY) { appendToolItem(C); }
  loadConfig(INITIAL_CONFIG);
  let lastTime = performance.now();
  const frame = (now: number) => {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!(dt > 0)) { dt = 0; }
    dt = Math.min(dt, MAX_DT);
    if (!state.paused) {
      for (const item of state.items) { item.update(dt); }
      updateWaves(dt);
    }
    renderWaves();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}