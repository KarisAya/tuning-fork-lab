// DOM 引用集中在这里：一处获取，其他地方只读。

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export const deskEl = $('desk');
export const canvas = $('waves') as HTMLCanvasElement;
export const waveCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
if (!waveCtx) throw new Error('Canvas 2D context unavailable');
export const toolbar = $('toolbar');
export const menuEl = $('menu');
export const toolsEl = $('tools');
export const pauseBtn = $('btn-pause') as HTMLButtonElement;
export const resetBtn = $('btn-reset') as HTMLButtonElement;
export const exportBtn = $('btn-export') as HTMLButtonElement;
export const importBtn = $('btn-import') as HTMLButtonElement;
export const fileIn = $('file-input') as HTMLInputElement;
export const sampleRange = $('sample-range') as HTMLInputElement;
export const sampleVal = $('sample-val');

export const settingsBtn = $("btn-settings") as HTMLButtonElement;
export const closeSettingsBtn = $("btn-close-settings") as HTMLButtonElement;
export const settingsPanel = $("settings-panel");


function openSettings(): void {
  settingsPanel.classList.add("open");
  settingsPanel.setAttribute("aria-hidden", "false");
  settingsBtn.setAttribute("aria-expanded", "true");
}

function closeSettings(): void {
  settingsPanel.classList.remove("open");
  settingsPanel.setAttribute("aria-hidden", "true");
  settingsBtn.setAttribute("aria-expanded", "false");
}

function updatePauseButton(): void {
  const icon = pauseBtn.querySelector("i");
  if (!icon) return;
  icon.className = state.paused ? "fa-solid fa-play" : "fa-solid fa-pause";
  pauseBtn.setAttribute("aria-label", state.paused ? "继续" : "暂停");
  pauseBtn.setAttribute("title", state.paused ? "继续" : "暂停");
  pauseBtn.classList.toggle("on", state.paused);
}
function togglePause(): void {
  state.paused = !state.paused;
  updatePauseButton();
}
export const setupBtn = () => {
  settingsBtn.onclick = (event) => {
    event.stopPropagation();
    if (settingsPanel.classList.contains("open")) { closeSettings(); }
    else { openSettings(); }
  };
  closeSettingsBtn.onclick = closeSettings;
  pauseBtn.addEventListener('click', togglePause);
}
