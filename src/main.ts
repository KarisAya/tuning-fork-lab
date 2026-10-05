// 入口：只在启动时装配一次，其余逻辑都在各自模块里。

import './style/index.css';

import { boot } from './app';
import { GRID } from './core/constants';
import { state } from './state';
import { Bell } from './tools/Bell';
import { Car } from './tools/Car';
import { EchoBoard } from './tools/EchoBoard';
import { SmallTable } from './tools/SmallTable';
import { Tool } from './tools/Tool';
import { TuningFork } from './tools/TuningFork';
import { registerTool } from './tools/registry';
import { setSampleDensity } from './ui/sample-density';

boot();

// 调试 / 控制台入口，保持与旧版同名。
(window as Window & { TuningForkLab?: unknown }).TuningForkLab = {
  Tool,
  TuningFork,
  EchoBoard,
  SoundBoard: EchoBoard,
  SmallTable,
  Bell,
  Car,
  registerTool,
  items: state.items,
  GRID,
  setSampleDensity,
  get samples() {
    return state.samples;
  },
  get waves() {
    return state.waves;
  },
};
