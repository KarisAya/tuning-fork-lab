import { CONFIG_VERSION, GRID, SAMPLE_MIN, SAMPLE_MAX, SAMPLE_STEP } from '../core/constants';
import type { Config, SerializedItem } from '../core/types';
import { clamp } from '../core/math';
import { state } from '../core/state';
import { type ToolClass, TOOL_BY_NAME, addItem, spawnTool } from '../tools/manager';
import {
    toolsEl, menuEl,
    pauseBtn, resetBtn, settingsBtn,
    settingsPanel, closeSettingsBtn,
    sampleRange, sampleVal,
    exportBtn, fileIn, importBtn,
} from './dom';
import { closeMenu } from './menu';

export function openSettings(): void {
    settingsPanel.classList.add("open");
    settingsPanel.setAttribute("aria-hidden", "false");
    settingsBtn.setAttribute("aria-expanded", "true");
}

export function closeSettings(): void {
    settingsPanel.classList.remove("open");
    settingsPanel.setAttribute("aria-hidden", "true");
    settingsBtn.setAttribute("aria-expanded", "false");
}

export function togglePause() {
    state.paused = !state.paused;
    const icon = pauseBtn.querySelector("i") as HTMLElement;
    if (!icon) return;
    if (state.paused) {
        icon.className = "fa-solid fa-play";
        pauseBtn.setAttribute("aria-label", "继续");
        pauseBtn.setAttribute("title", "继续");
        pauseBtn.classList.remove("on");

    } else {
        icon.className = "fa-solid fa-pause";
        pauseBtn.setAttribute("aria-label", "暂停");
        pauseBtn.setAttribute("title", "暂停");
        pauseBtn.classList.add("on");
    }
}

export function resetDesk(): void {
    state.waves = [];
    state.items.forEach((i) => i.remove());
    state.items.splice(0)
    state.occStale = true;
    closeMenu();
}

/** 点击菜单外部时收起菜单。 */
export function isMenuOpen(): boolean {
    return menuEl.classList.contains('open');
}

export function exportConfig(): void {
    const cfg = {
        version: CONFIG_VERSION,
        grid: GRID,
        samples: state.samples,
        desk: { w: state.deskW, h: state.deskH },
        items: state.items.map((item) => item.serialize()),
    };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wave-lab.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

function setSampleDensity(samples: number) {
    const n = clamp(Math.round(samples / SAMPLE_STEP) * SAMPLE_STEP, SAMPLE_MIN, SAMPLE_MAX);
    sampleRange.value = String(n);
    sampleVal.textContent = String(n);
    state.samples = n;
}

export function loadConfig(cfg: unknown): void {
    if (!cfg || typeof cfg !== 'object') { return; }
    const data = cfg as Config;
    if (!Array.isArray(data.items)) { return; }
    if (typeof data.samples === 'number') { setSampleDensity(data.samples); }
    if (typeof data.waveSpeed === 'number') { state.waveSpeed = data.waveSpeed; }
    resetDesk();
    for (const raw of data.items) {
        if (!raw || typeof raw !== 'object') { continue; }
        const d = raw as SerializedItem;
        const C = TOOL_BY_NAME[d.type];
        if (!C) continue;
        // @ts-ignore C 一定是实现的
        const item = new C(typeof d.x === 'number' ? d.x : 0, typeof d.y === 'number' ? d.y : 0);
        item.deserialize(d);
        addItem(item);
    }
}
export const setupBtn = () => {
    settingsBtn.onclick = (event) => {
        event.stopPropagation();
        if (settingsPanel.classList.contains("open")) { closeSettings(); }
        else { openSettings(); }
    };
    closeSettingsBtn.onclick = closeSettings;
    pauseBtn.onclick = togglePause;
    resetBtn.onclick = resetDesk;
    settingsPanel.hidden = false;
    sampleRange.oninput = () => setSampleDensity(Number(sampleRange.value));
    exportBtn.onclick = exportConfig;
    fileIn.addEventListener('change', () => {
        const file = fileIn.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { loadConfig(JSON.parse(String(reader.result))); }
            catch (error) { console.warn('配置解析失败', error); }
        };
        reader.readAsText(file);
        fileIn.value = '';
    });
    importBtn.onclick = () => fileIn.click();
}

export function appendToolItem(C: ToolClass): void {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.type = 'button';
    button.innerHTML = `<span class="ico">${C.icon}</span><span>${C.label}</span>`;
    button.title = `添加${C.label}`;
    button.addEventListener('click', () => { spawnTool(C); });
    toolsEl.appendChild(button);
}

