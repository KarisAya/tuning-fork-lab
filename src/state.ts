// 全局可变状态：桌面尺寸、模拟开关、桌面上的工具与波。
// 其他模块通过这个对象读写，避免各文件各自维护同名全局变量。

import type { Occluder, Wave } from './core/types';
import type { Tool } from './tools/Tool';

export interface LabState {
  deskW: number;
  deskH: number;
  dpr: number;
  waveSpeed: number;
  samples: number;
  paused: boolean;
  items: Tool[];
  waves: Wave[];
  occluders: Map<string, Occluder>;
}

export const state: LabState = {
  deskW: 0,
  deskH: 0,
  dpr: 1,
  waveSpeed: 0,
  samples: 0,
  paused: false,
  items: [],
  waves: [],
  occluders: new Map<string, Occluder>(),
};
