// 桌面上的工具增删。只操作 state.items，不碰 DOM 以外的逻辑。
import { GRID } from '../core/constants';
import { state } from '../core/state';
import type { Tool } from './Tool';

export type ToolClass = typeof Tool;
export const TOOL_REGISTRY: ToolClass[] = [];
export const TOOL_BY_NAME: Record<string, ToolClass> = {};

/** 在随机位置新增一个工具，落点由工具类的 spawnY 决定。 */

export function spawnTool(Cls: ToolClass): Tool {
  const [gw, gh] = Cls.size;
  const maxGX = Math.max(0, Math.floor((state.deskW - gw * GRID) / GRID));
  const maxGY = Math.max(0, Math.floor((state.deskH - gh * GRID) / GRID));
  const gx = maxGX > 2 ? 1 + Math.floor(Math.random() * Math.max(1, maxGX - 2)) : 0;
  const gy = Math.max(0, Math.floor(maxGY / 2));
  // @ts-ignore Cls 是可实例化的工具类
  const item = new Cls(gx, gy) as Tool;
  state.items.push(item);
  return item;
}

/** 已构造好的工具（例如从配置还原）登记进桌面。 */
export function addItem(item: Tool): void {
  state.items.push(item);
}

export function removeItem(item: Tool): void {
  const index = state.items.findIndex((it) => (it as unknown) === item);
  if (index >= 0) {
    state.items.splice(index, 1);
  }
  item.remove();
  state.occStale = true;
}

export function registerTool(Cls: ToolClass): void {
  TOOL_REGISTRY.push(Cls);
  TOOL_BY_NAME[Cls.name] = Cls;
}