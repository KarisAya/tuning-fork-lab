// 入口：只在启动时装配一次，其余逻辑都在各自模块里。

import './styles/index.css';
// import { registerTool } from './tools/manager';
// import { TuningFork } from './tools/TuningFork';
// import { Bell } from './tools/Bell';
// import { EchoBoard } from './tools/EchoBoard';
// import { SmallTable } from './tools/SmallTable';
// import { BouncyBall } from './tools/BouncyBall';
// import { Car } from './tools/Car';
import { boot } from './app';


// // registerTool(TuningFork);
// // registerTool(Bell);
// // registerTool(EchoBoard);
// // registerTool(SmallTable);
// // registerTool(BouncyBall);
// // registerTool(Car);
boot();