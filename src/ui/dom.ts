// DOM 引用集中在这里：一处获取，其他地方只读。

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export const deskEl = $('desk');
export const canvas = $('waves') as HTMLCanvasElement;
export const waveCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
if (!waveCtx) throw new Error('Canvas 2D context unavailable');
export const toolbar = $('toolbar');
export const menuEl = $('menu');
export const toolsEl = $('tools');
export const pauseBtn = $('btn-pause') as HTMLButtonElement;
export const resetBtn = $('btn-reset') as HTMLButtonElement;
export const exportBtn = $('btn-export') as HTMLButtonElement;
export const importBtn = $('btn-import') as HTMLButtonElement;
export const fileIn = $('file-input') as HTMLInputElement;
export const sampleRange = $('sample-range') as HTMLInputElement;
export const sampleVal = $('sample-val');
