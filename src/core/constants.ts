// 全局常量：数值只在这里定义，其他模块只读。

export const GRID = 24;
export const GRAVITY = 2400;
export const FRICTION = 1100;
export const RESTITUTION = 0.6;
export const MAX_DT = 1 / 30;
export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI * 0.5;

// 波形生命周期与强度
export const WAVE_TIME = 10;
export const WAVE_LW = 1.05;
export const X_LIMIT = GRID * 48;
export const MIN_WAVE_EFFECTIVE_ALPHA = 0.018;
export const WAVE_FADE_DURATION = 0.28;
export const WAVE_REMOVE_ALPHA = 0.01;

// 发射间隔端点（秒）：最低频 → 最高频
export const EMIT_SLOW = 1;
export const EMIT_FAST = 0.05;

// 音叉共振
export const RES_RANGE = GRID * 8;
export const RES_DETUNE = 0.035;

// 频率档位表：等比十档 + 两端兜底
export const FREQ_TABLE = [
  10, 19.95, 39.81, 79.43, 158.49, 316.23, 630.96, 1258.93, 2511.89, 5011.87, 10000,
] as const;
export const TOP_LEVEL = FREQ_TABLE.length - 1;
export const FREQ_MIN = FREQ_TABLE[0];
export const FREQ_MAX = FREQ_TABLE[TOP_LEVEL];

// 反射 / 衍射
export const MAX_REFLECTION_DEPTH = 3;
export const MAX_DIFFRACTION_DEPTH = 3;
export const WAVE_COUNT_LIMIT_THRESHOLD = 128;
export const DIFF_DECAY = GRID * 5.2;
export const DIFF_GAP_RANGE = GRID * 4;
export const DIFF_EDGE_POWER = 0.72;

// 渲染
export const RENDER_SAMPLES = 512;
export const SECONDARY_RENDER_SAMPLES = 256;
export const SHADOW_SOFTNESS = GRID * 1.35;

// 小车
export const CAR_CROSS_TIME = 20;
export const CAR_DEFAULT_FREQ = 316.23;
export const CAR_SPEED_MAX = 5;

// 采样密度控件
export const SAMPLE_MIN = 256;
export const SAMPLE_MAX = 2048;
export const SAMPLE_STEP = 64;
export const DEFAULT_SAMPLES = 512;
