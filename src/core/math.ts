// 纯数学工具，无副作用。

export const clamp = (v: number, a: number, b: number): number =>
  (v < a ? a : v > b ? b : v);

export const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
