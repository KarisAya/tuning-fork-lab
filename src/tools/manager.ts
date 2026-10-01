// 桌面上的工具增删。只操作 state.items，不碰 DOM 以外的逻辑。

import { GRID } from '../core/constants';
import type { Removable } from '../core/types';
import { state } from '../state';
import type { Tool } from './Tool';
import type { ToolClass } from './registry';

/** 在随机位置新增一个工具，落点由工具类的 spawnY 决定。 */
export function spawnTool(Cls: ToolClass): Tool {
  const [gw, gh] = Cls.size;
  const maxGX = Math.max(0, Math.floor((state.deskW - gw * GRID) / GRID));
  const maxGY = Math.max(0, Math.floor((state.deskH - gh * GRID) / GRID));
  const gx = maxGX > 2 ? 1 + Math.floor(Math.random() * Math.max(1, maxGX - 2)) : 0;
  const item = new Cls(gx, Cls.spawnY(maxGY));
  state.items.push(item);
  return item;
}

/** 已构造好的工具（例如从配置还原）登记进桌面。 */
export function addItem(item: Tool): void {
  state.items.push(item);
}

export function removeItem(item: Removable): void {
  const index = state.items.findIndex((it) => (it as unknown) === item);
  if (index >= 0) {
    state.items.splice(index, 1);
  }
  item.remove();
}
