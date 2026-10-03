// 全局常量：数值只在这里定义，其他模块只读。

export const GRID = 24;
export const GRAVITY = 2400;
export const FRICTION = 0.5;
export const RESTITUTION = 0.6;
export const MAX_DT = 1 / 30;
export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI * 0.5;

// 波形生命周期与强度
export const WAVE_SPEED = GRID * 4;
export const WAVE_LW = 1.05;
export const MAX_TRAVEL_DISTANCE = GRID * 32;
export const MIN_WAVE_EFFECTIVE_ALPHA = 0.018;
export const WAVE_FADE_DURATION = 2;


// 发射间隔端点（秒）：最低频 → 最高频
export const EMIT_SLOW = 1;
export const EMIT_FAST = 0.05;



// 频率档位表：等比十档 + 两端兜底
export const FREQ_TABLE = [13.75, 27.5, 55, 110, 220, 440, 880, 1760, 3520, 7040] as const;
export const TOP_LEVEL = FREQ_TABLE.length - 1;
export const FREQ_MIN = 10;
export const FREQ_MAX = 10000;
export const DEFAULT_LEVEL = 5;
export const DEFAULT_FREQ = FREQ_TABLE[DEFAULT_LEVEL];
// 反射 / 衍射
export const WAVE_COUNT_THROTTLE_START = 128;
export const WAVE_COUNT_THROTTLE_STRICT = 512;
export const DIFF_DECAY = GRID * 5.2;
export const DIFF_GAP_RANGE = GRID * 4;
export const DIFF_EDGE_POWER = 0.72;

// 渲染
export const RENDER_SAMPLES = 512;
export const SECONDARY_RENDER_SAMPLES = 128;
export const SHADOW_SOFTNESS = GRID * 1.35;

// 小车
export const CAR_SPEED_MAX = 2;

// 采样密度控件
export const SAMPLE_MIN = 256;
export const SAMPLE_MAX = 2048;
export const SAMPLE_STEP = 64;
export const DEFAULT_SAMPLES = 512;
