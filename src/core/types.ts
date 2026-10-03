// 跨模块共享的数据类型。这里只放结构性描述，不引用任何具体工具类。

export type Point = [number, number];
export type Segment = [number, number, number, number];
export type BoardDirection = 'v' | 'h';

export interface SerializedItem {
  type: string;
  x: number;
  y: number;
  [key: string]: unknown;
}

/** 可调频发声工具的公共部分（频率 + 档位）。 */
export interface TunedSource {
  freq: number;
  intv: number;
  level: number;
  getEmissionPoint(): Point;
}

/** 菜单/管理用的最小可删除能力。 */
export interface Removable {
  removed: boolean;
  remove(): void;
}

/** 能作为波遮挡体的工具能力（隔音板 / 回音板）。 */
export interface WaveObstacle {
  removed: boolean;
  dragging: boolean;
  readonly occludesWaves: boolean;
  readonly reflectsWaves: boolean;
  occluderSegment(): Segment | null;
  occluderKey(): string;
}

export interface ReflectionHop {
  item: WaveObstacle;
  seg: Segment;
  bounce: Point;
}

export interface DiffractionInfo {
  board: WaveObstacle;
  edgeIndex: number;
  edge: Point;
  incidentSource: Point;
}

export interface Wave {
  x: number;
  y: number;
  r: number;
  hue: number;
  freq: number;
  travelDistance: number;
  sourceX: number;
  sourceY: number;
  reflections: ReflectionHop[];
  birthR: number;
  diffraction: DiffractionInfo | null;
  diffractionDepth: number;
  /** 低于二级波计算阈值后，停止反射/衍射，并进入平滑淡出。 */
  fadeOut: number;
  skipTag: boolean;
  /** 仅用于分支去重；不再作为主波渲染的硬遮罩。 */
  emittedReflections: Set<WaveObstacle>;
  emittedDiffractions: Set<string>;
}

/** 采集得到的遮挡体快照（模拟层内部使用）。 */
export interface Occluder {
  item: WaveObstacle;
  seg: Segment;
  reflect: boolean;
  key: string;
  ends: Point[];
  nx: number;
  ny: number;
  gains: number[];
}
