// 铃铛：点击 / 持续发声，不参与共振。

import type { Point, SerializedItem } from '../core/types';
import { clamp } from '../core/math';
import { waveInterval } from '../render/visuals';
import { emitWaveAt } from '../render/wave';
import { Tool } from './Tool';
import { button, rowLabel, refreshMenu, createContextMenu } from '../ui/menu';


type WaveMode = 'click' | 'continuous';
export function setFreq(item: SoundEmitter, raw: number): void {
    let value = Number.isFinite(raw) ? raw : FREQ_MIN;
    value = clamp(value, FREQ_MIN, FREQ_MAX);
    value = Math.round(value * 100) / 100;
    item.freq = value;
    item.intv = waveInterval(value);
    item.level = FREQ_TABLE.findIndex((v) => Math.abs(v - value) < 0.005);
}
/** 按档位表上下切一档；不在档位上时取相邻档。 */
export function stepLevel(item: SoundEmitter, direction: -1 | 1): void {
    const cur = item.freq;
    if (direction > 0) {
        const next = FREQ_TABLE.find((v) => v > cur + 1e-6);
        setFreq(item, next ?? FREQ_MAX);
        return;
    }
    let prev: number | null = null;
    for (const value of FREQ_TABLE) {
        if (value < cur - 1e-6) { prev = value; }
    }
    setFreq(item, prev ?? FREQ_MIN);
}


// 发声类工具共用的菜单控件。
export function appendToneControls(body: HTMLElement, item: SoundEmitter): void {
    body.appendChild(rowLabel('发声模式'));
    const modeRow = document.createElement('div');
    modeRow.className = 'menu-row menu-row-cells';
    modeRow.appendChild(button('点击发声', () => { item.mode = 'click'; item.emitTimer = 0; refreshMenu(item); }, item.mode === 'click'));
    modeRow.appendChild(button('持续发声', () => { item.mode = 'continuous'; item.emitTimer = 0; refreshMenu(item); }, item.mode === 'continuous'));
    body.appendChild(modeRow);
    body.appendChild(rowLabel('频率（Hz）'));
    const freqRow = document.createElement('div');
    freqRow.className = 'menu-row';
    const input = document.createElement('input');
    input.className = 'menu-input';
    input.type = 'number';
    input.min = String(FREQ_MIN);
    input.max = String(FREQ_MAX);
    input.step = '0.01';
    input.value = item.freq.toFixed(2);
    input.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
    });
    input.addEventListener('change', () => {
        setFreq(item, Number(input.value));
        refreshMenu(item);
    });
    const down = button('▼', () => {
        stepLevel(item, -1);
        refreshMenu(item);
    });
    const up = button('▲', () => {
        stepLevel(item, 1);
        refreshMenu(item);
    });
    freqRow.append(down, input, up);
    body.appendChild(freqRow);
    const info = document.createElement('div');
    info.className = 'menu-note';
    const where = item.level >= 0
        ? `档位 ${item.level} / ${TOP_LEVEL}`
        : '自定义频率';
    info.innerHTML = `${where} · ${item.freq.toFixed(2)} Hz<br>`
        + `发射间隔 ${waveInterval(item.freq).toFixed(3)} 秒 / 个<br>`
        + `范围 ${FREQ_MIN} ~ ${FREQ_MAX} Hz`;
    body.appendChild(info);
}
export abstract class SoundEmitter extends Tool {
    freq: number = DEFAULT_FREQ;
    intv: number = waveInterval(DEFAULT_FREQ);
    level: number = DEFAULT_LEVEL;
    mode: WaveMode = 'click';
    /** 发声计时器 （归一化） */
    emitTimer: number = 0;
    get emissionPoint(): Point { return [this.px + this.w / 2, this.py + this.h / 2]; }
    /** 触发一次发声（点击） */
    protected emitOnce(): void {
        this.emitTimer = 1
        emitWaveAt(this.emissionPoint, this.freq);
    }
    protected onClick(): void { this.emitOnce(); }
    protected onTick(dt: number): void {
        if (this.emitTimer > 0) { this.emitTimer -= dt / this.intv; }
        else if (this.mode === 'continuous') { this.emitOnce() }
    }
    static contextMenu(item: SoundEmitter): HTMLElement {
        const [root, body] = createContextMenu(item, this.label);
        appendToneControls(body, item);
        return root;
    }

    serialize(): SerializedItem {
        return {
            ...super.serialize(),
            freq: this.freq,
            mode: this.mode,
        };
    }

    deserialize(data: SerializedItem): void {
        super.deserialize(data);
        if (typeof data.freq === 'number') { setFreq(this, data.freq); }
        if (data.mode === 'continuous' || data.mode === 'click') { this.mode = data.mode; }
    }
}