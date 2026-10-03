// 跨模块共享的数据类型。这里只放结构性描述，不引用任何具体工具类。

export type Point = [number, number];
export type Segment = [Point, Point];


export interface SerializedItem {
  type: string;
  x: number;
  y: number;
  [key: string]: unknown;
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
  get occluder(): Occluder | null
}

export interface ReflectionHop {
  occ: Occluder;
  seg: Segment;
  bounce: Point;
}

export interface DiffractionInfo {
  board: Occluder;
  edgeIndex: number;
  edge: Point;
  incidentSource: Point;
}

export interface Wave {
  position: Point;
  r: number;
  hue: number;
  freq: number;
  travelDistance: number;
  source: Point;
  reflections: ReflectionHop[];
  birthR: number;
  diffraction: DiffractionInfo | null;
  diffractionDepth: number;
  /** 低于二级波计算阈值后，停止反射/衍射，并进入平滑淡出。 */
  fadeOut: number;
  skipTag: boolean;
  /** 仅用于分支去重；不再作为主波渲染的硬遮罩。 */
  emittedReflections: Set<string>;
  emittedDiffractions: Set<string>;
  sourceX: number;
  sourceY: number;

}

/** 采集得到的遮挡体快照（模拟层内部使用）。 */
export interface Occluder {
  diffraction: [boolean, boolean];
  reflect: boolean;
  seg: Segment;
  key: string;
}
