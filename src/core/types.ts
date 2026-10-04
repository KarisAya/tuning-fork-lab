// 跨模块共享的数据类型。这里只放结构性描述，不引用任何具体工具类。

export type Point = readonly [number, number];
export type Segment = readonly [Point, Point];


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

export interface ReflectionHop {
  occ: Occluder;
  bounce: Point;
}

export interface DiffractionInfo {
  board: Occluder;
  edgeIndex: number;
  edge: Point;
  incidentSource: Point;
  parent: Wave;
  // 几何缓存
  abX: number;
  abY: number;
  ae1X: number;
  ae1Y: number;
  crossAB_AE1: number;
  aeXu: number;
  aeYu: number;
  beL: number;
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
  diffractionInfo: DiffractionInfo | null;
  diffraction: Wave | null;
  /** 低于二级波计算阈值后，停止反射/衍射，并进入平滑淡出。 */
  fadeOut: number;
  skipTag: boolean;
  /** 仅用于分支去重；不再作为主波渲染的硬遮罩。 */
  emittedReflections: Set<string>;
  emittedDiffractions: Set<string>;
}

export type UniSeg = [string, Segment, boolean]

/** 采集得到的遮挡体快照（模拟层内部使用）。 */
export interface Occluder {
  key: string;
  diffraction: [boolean, boolean];
  reflect: boolean;
  seg: Segment;
  nx: number;
  ny: number;
}
