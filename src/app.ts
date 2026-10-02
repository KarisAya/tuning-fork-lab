// 事件绑定与主循环。应用的入口逻辑在 main.ts 调用 boot() 时启动。
import { INITIAL_CONFIG, exportConfig, loadConfig, clearDesk } from './config';
import { GRID, WAVE_SPEED, MAX_DT, SAMPLE_MAX, SAMPLE_MIN, DEFAULT_SAMPLES, SAMPLE_STEP } from './core/constants';
import { state } from './state';
import { renderWaves } from './render/waves';
import { updateWaves } from './sim/waves';
import { spawnTool } from './tools/manager';
import { TOOL_REGISTRY } from './tools/registry';
import {
  canvas,
  toolbar,
  toolsEl,
  waveCtx,
  deskEl,
  exportBtn,
  fileIn,
  importBtn,
  menuEl,
  pauseBtn,
  resetBtn,
  sampleRange,
  sampleVal,
} from './ui/dom';
import { closeMenu, isMenuOpen } from './ui/menu-controller';
import { setSampleDensity } from './ui/sample-density';

export function layout(): void {
  state.deskW = Math.floor(window.innerWidth);
  state.deskH = Math.max(GRID, Math.floor((window.innerHeight - toolbar.offsetHeight) / GRID) * GRID);
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  // 桌面布局：视口尺寸 → 网格桌面 → 画布分辨率与波速。
  deskEl.style.width = `${state.deskW}px`;
  deskEl.style.height = `${state.deskH}px`;
  deskEl.style.backgroundSize = `${GRID}px ${GRID}px, ${GRID}px ${GRID}px`;
  canvas.width = Math.max(1, Math.floor(state.deskW * state.dpr));
  canvas.height = Math.max(1, Math.floor(state.deskH * state.dpr));
  canvas.style.width = `${state.deskW}px`;
  canvas.style.height = `${state.deskH}px`;
  waveCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

export function togglePause(): void {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '▶ 继续' : '⏸ 暂停';
  pauseBtn.classList.toggle('on', state.paused);
}
export function boot(): void {
  state.waveSpeed = WAVE_SPEED;
  state.samples = DEFAULT_SAMPLES;
  state.paused = false;
  sampleRange.min = String(SAMPLE_MIN);
  sampleRange.max = String(SAMPLE_MAX);
  sampleRange.step = String(SAMPLE_STEP);
  layout();
  pauseBtn.addEventListener('click', () => {
    togglePause();
  });
  resetBtn.addEventListener('click', clearDesk);
  exportBtn.addEventListener('click', exportConfig);
  importBtn.addEventListener('click', () => {
    fileIn.click();
  });
  sampleRange.addEventListener('input', () => {
    setSampleDensity(Number(sampleRange.value));
  });
  fileIn.addEventListener('change', () => {
    const file = fileIn.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadConfig(JSON.parse(String(reader.result)));
      } catch (error) {
        console.warn('配置解析失败', error);
      }
    };
    reader.readAsText(file);
    fileIn.value = '';
  });
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) { return; }
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  });
  document.addEventListener('pointerdown', (event) => { if (isMenuOpen() && !menuEl.contains(event.target as Node)) { closeMenu(); } });
  deskEl.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('resize', () => { layout(); for (const item of state.items) { item.render(); } });
  toolsEl.innerHTML = '';
  for (const C of TOOL_REGISTRY) {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.type = 'button';
    button.innerHTML = `<span class="ico">${C.icon}</span><span>${C.label}</span>`;
    button.title = `添加${C.label}`;
    button.addEventListener('click', () => { spawnTool(C); });
    toolsEl.appendChild(button);
  }
  loadConfig(INITIAL_CONFIG);
  sampleVal.textContent = String(state.samples);
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
