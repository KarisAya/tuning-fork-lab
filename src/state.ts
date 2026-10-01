// 全局可变状态：桌面尺寸、模拟开关、桌面上的工具与波。
// 其他模块通过这个对象读写，避免各文件各自维护同名全局变量。

import { DEFAULT_SAMPLES } from './core/constants';
import type { Occluder, Wave } from './core/types';
import type { Tool } from './tools/Tool';

export interface LabState {
  deskW: number;
  deskH: number;
  dpr: number;
  waveSpeed: number;
  maxR: number;
  samples: number;
  paused: boolean;
  items: Tool[];
  waves: Wave[];
  occluders: Occluder[];
}

export const state: LabState = {
  deskW: 0,
  deskH: 0,
  dpr: 1,
  waveSpeed: 100,
  maxR: 1000,
  samples: DEFAULT_SAMPLES,
  paused: false,
  items: [],
  waves: [],
  occluders: [],
};
