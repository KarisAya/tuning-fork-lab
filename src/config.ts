// 桌面配置：初始布局、导出、导入还原。

import { DEFAULT_SAMPLES, GRID, DEFAULT_FREQ } from './core/constants';
import type { SerializedItem } from './core/types';
import { state } from './state';
import { addItem, removeItem } from './tools/manager';
import { toolClassFor } from './tools/registry';
import { closeMenu } from './ui/menu-controller';
import { setSampleDensity } from './ui/sample-density';

const CONFIG_VERSION = 10;

export const INITIAL_CONFIG = {
  version: CONFIG_VERSION,
  grid: GRID,
  samples: DEFAULT_SAMPLES,
  desk: { w: 1920, h: 816 },
  items: [
    { "type": "SmallTable", "x": 7, "y": 28, "gw": 1, "gh": 6 },
    { "type": "SmallTable", "x": 13, "y": 28, "gw": 1, "gh": 6 },
    { "type": "SmallTable", "x": 7, "y": 27, "gw": 7, "gh": 1 },
    { "type": "SmallTable", "x": 10, "y": 26, "gw": 1, "gh": 1 },
    { "type": "EchoBoard", "x": 7, "y": 20, "dir": "v", "len": 7, "reflect": false },
    { "type": "EchoBoard", "x": 7, "y": 19, "dir": "h", "len": 7, "reflect": false },
    { "type": "EchoBoard", "x": 7, "y": 3, "dir": "h", "len": 7, "reflect": false },
    { "type": "EchoBoard", "x": 14, "y": 20, "dir": "v", "len": 3, "reflect": false },
    { "type": "EchoBoard", "x": 14, "y": 24, "dir": "v", "len": 3, "reflect": false },
    { "type": "TuningFork", "x": 9, "y": 21, "freq": 55, "mode": "click" },
  ],
} as const;

/** 清空桌面：工具、波、以及可能指向已删工具的菜单。 */
export function clearDesk(): void {
  while (state.items.length) {
    removeItem(state.items[state.items.length - 1]);
  }
  state.waves = [];
  closeMenu();
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
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function loadConfig(cfg: unknown): void {
  if (!cfg || typeof cfg !== 'object') {
    return;
  }
  const data = cfg as { samples?: unknown; items?: unknown };
  if (!Array.isArray(data.items)) {
    return;
  }
  clearDesk();
  if (typeof data.samples === 'number') {
    setSampleDensity(data.samples);
  }
  for (const raw of data.items) {
    if (!raw || typeof raw !== 'object') { continue; }
    const d = raw as SerializedItem;
    const C = toolClassFor(d.type);
    if (!C) continue;
    // @ts-ignore C 一定是实现的
    const item = new C(typeof d.x === 'number' ? d.x : 0, typeof d.y === 'number' ? d.y : 0,);
    item.deserialize(d);
    addItem(item);
  }
}

