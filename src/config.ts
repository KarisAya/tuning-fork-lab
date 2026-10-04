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
    { "type": "BouncyBall", "x": 16, "y": 30, "freq": 55, "mode": "click", "bounceFactor": 1, "frictionFactor": 0.8 },
    { "type": "SmallTable", "x": 11, "y": 0, "gw": 1, "gh": 12 },
    { "type": "SmallTable", "x": 11, "y": 12, "gw": 12, "gh": 1 },
    { "type": "SmallTable", "x": 22, "y": 0, "gw": 1, "gh": 12 },
    { "type": "EchoBoard", "x": 23, "y": 8, "dir": "v", "len": 5, "reflect": true },
    { "type": "EchoBoard", "x": 23, "y": 14, "dir": "v", "len": 5, "reflect": true },
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
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const d = raw as SerializedItem;
    const C = toolClassFor(d.type);
    if (!C) continue;
    // @ts-ignore C 一定是实现的
    const item = new C(typeof d.x === 'number' ? d.x : 0, typeof d.y === 'number' ? d.y : 0);
    item.deserialize(d);
    addItem(item);
  }
}
