// 小车菜单：运行状态、方向、速度，外加频率控件。

import { CAR_CROSS_TIME, CAR_SPEED_MAX } from '../../core/constants';
import { clamp } from '../../core/math';
import type { Emitter, Removable, TunedSource, WaveMode } from '../../core/types';
import { emitWave } from '../../sim/waves';
import { button, createContextMenu, menuBody, rowLabel } from '../menu';
import { placeMenu, refreshMenu } from '../menu-controller';
import { appendToneControls } from './tone';

export interface CarControls extends Emitter, TunedSource, Removable {
  running: boolean;
  speed: number;
  direction: -1 | 1;
  mode: WaveMode;
  emitTimer: number;
  vib: number;
}

export function buildCarMenu(item: CarControls): HTMLElement {
  const root = createContextMenu(item, '小车 · 移动声源');
  const body = menuBody(root);
  body.appendChild(rowLabel('运行状态'));
  const runRow = document.createElement('div');
  runRow.className = 'menu-row';
  runRow.appendChild(button(item.running ? '⏹ 停止' : '▶ 启动', () => {
    item.running = !item.running;
    item.emitTimer = 0;
    if (item.running) {
      emitWave(item);
    }
    refreshMenu(item);
  }, item.running));
  body.appendChild(runRow);
  body.appendChild(rowLabel('方向'));
  const dirRow = document.createElement('div');
  dirRow.className = 'menu-row';
  dirRow.append(
    button('← 向左', () => {
      item.direction = -1;
      refreshMenu(item);
    }, item.direction === -1),
    button('→ 向右', () => {
      item.direction = 1;
      refreshMenu(item);
    }, item.direction === 1),
  );
  body.appendChild(dirRow);
  body.appendChild(rowLabel('速度', `${item.speed.toFixed(1)} ×`));
  const speedRow = document.createElement('div');
  speedRow.className = 'menu-row';
  const speedOut = document.createElement('strong');
  speedOut.className = 'menu-value';
  speedOut.textContent = `${item.speed.toFixed(1)} ×`;
  const minus = button('− 0.1', () => {
    item.speed = clamp(Math.round((item.speed - 0.1) * 10) / 10, 0.1, CAR_SPEED_MAX);
    speedOut.textContent = `${item.speed.toFixed(1)} ×`;
    placeMenu();
  });
  const plus = button('+ 0.1', () => {
    item.speed = clamp(Math.round((item.speed + 0.1) * 10) / 10, 0.1, CAR_SPEED_MAX);
    speedOut.textContent = `${item.speed.toFixed(1)} ×`;
    placeMenu();
  });
  speedRow.append(minus, speedOut, plus);
  body.appendChild(speedRow);
  appendToneControls(body, item, { mode: false });
  const note = document.createElement('div');
  note.className = 'menu-note';
  note.textContent = `速度 1 = ${CAR_CROSS_TIME.toFixed(0)} 秒横穿整个桌面；启动即发声，移动中持续发出 ${item.freq.toFixed(2)} Hz 声波；到边界自动停止。`;
  body.appendChild(note);
  return root;
}
