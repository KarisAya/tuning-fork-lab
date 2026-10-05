// 事件绑定与主循环。应用的入口逻辑在 main.ts 调用 boot() 时启动。
import { INITIAL_CONFIG, exportConfig, loadConfig, clearDesk } from './config';
import { GRID, WAVE_SPEED, MAX_DT, SAMPLE_MAX, SAMPLE_MIN, DEFAULT_SAMPLES, SAMPLE_STEP } from './core/constants';
import { state } from './state';
import { renderWaves } from './render/waves';
import { updateWaves } from './sim/waves';
import { TOOL_REGISTRY } from './tools/registry';
import {
  canvas,
  toolsEl,
  waveCtx,
  deskEl,
  menuEl,
  sampleRange,
  settingsBtn,
  settingsPanel,
} from './ui/dom';
import { closeSettings, closeMenu, togglePause, setupBtn, isMenuOpen, appendToolItem } from './ui/';

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
  state.waveSpeed = WAVE_SPEED;
  state.samples = DEFAULT_SAMPLES;
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
