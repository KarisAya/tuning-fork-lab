// 发声类工具（音叉 / 铃铛）共用的菜单控件。

import { FREQ_MAX, FREQ_MIN, TOP_LEVEL } from '../../core/constants';
import { setFreq, stepLevel, waveInterval } from '../../core/frequency';
import type { Removable, TunedSource, WaveMode } from '../../core/types';
import { button, createContextMenu, menuBody, rowLabel } from '../menu';
import { refreshMenu } from '../menu-controller';

export interface ToneControls extends TunedSource, Removable {
  mode: WaveMode;
  emitTimer: number;
  vib: number;
}

/** 频率、档位、发声模式；`mode` 为 false 时不出模式开关（小车用）。 */
export function appendToneControls(
  body: HTMLElement,
  item: ToneControls,
  options: { mode: boolean },
): void {
  if (options.mode) {
    body.appendChild(rowLabel('发声模式'));
    const modeRow = document.createElement('div');
    modeRow.className = 'menu-row';
    modeRow.append(
      button('点击发声', () => {
        item.mode = 'click';
        item.emitTimer = 0;
        item.vib = Math.min(item.vib, 0.2);
        refreshMenu(item);
      }, item.mode === 'click'),
      button('持续发声', () => {
        item.mode = 'continuous';
        item.emitTimer = 0;
        refreshMenu(item);
      }, item.mode === 'continuous'),
    );
    body.appendChild(modeRow);
  }
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

export function buildForkMenu(item: ToneControls): HTMLElement {
  return buildToneMenu(item, '音叉');
}

export function buildToneMenu(item: ToneControls, title: string): HTMLElement {
  const root = createContextMenu(item, title);
  appendToneControls(menuBody(root), item, { mode: true });
  return root;
}
