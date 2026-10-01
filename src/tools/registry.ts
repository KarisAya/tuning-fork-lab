// 工具注册表：工具栏顺序、按名字还原、旧配置类名的别名。

import { Bell } from './Bell';
import { Car } from './Car';
import { EchoBoard } from './EchoBoard';
import { SmallTable } from './SmallTable';
import { Tool } from './Tool';
import { TuningFork } from './TuningFork';

export type ToolClass = typeof Tool;

export const TOOL_REGISTRY: ToolClass[] = [];
const TOOL_BY_NAME: Record<string, ToolClass> = {};

export function registerTool(Cls: ToolClass): void {
  TOOL_REGISTRY.push(Cls);
  TOOL_BY_NAME[Cls.name] = Cls;
}

registerTool(TuningFork);
registerTool(Bell);
registerTool(EchoBoard);
registerTool(SmallTable);
registerTool(Car);

/** 旧配置里的类名 → 当前实现。 */
const LEGACY_NAMES: Record<string, ToolClass> = {
  SoundBoard: EchoBoard,
};

export function toolClassFor(type: string): ToolClass | undefined {
  return TOOL_BY_NAME[type] ?? LEGACY_NAMES[type];
}
