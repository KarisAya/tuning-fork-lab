// 工具注册表：工具栏顺序、按名字还原、旧配置类名的别名。
import { Tool } from './Tool';
import { TuningFork } from './TuningFork';
import { Bell } from './Bell';
// import { EchoBoard } from './EchoBoard';
// import { SmallTable } from './SmallTable';
// import { Car } from './Car';
// import { BouncyBall } from './BouncyBall';


export type ToolClass = typeof Tool;

export const TOOL_REGISTRY: ToolClass[] = [];
const TOOL_BY_NAME: Record<string, ToolClass> = {};

export function registerTool(Cls: ToolClass): void {
  TOOL_REGISTRY.push(Cls);
  TOOL_BY_NAME[Cls.name] = Cls;
}

registerTool(TuningFork);
registerTool(Bell);
// registerTool(EchoBoard);
// registerTool(SmallTable);
// registerTool(Car);
// registerTool(BouncyBall);



export function toolClassFor(type: string): ToolClass | undefined {
  return TOOL_BY_NAME[type]
}
