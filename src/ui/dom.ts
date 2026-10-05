

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export const deskEl = $('desk');
export const canvas = $<HTMLCanvasElement>('waves');
export const waveCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
if (!waveCtx) throw new Error('Canvas 2D context unavailable');
export const toolbar = $('toolbar');
export const menuEl = $('menu');
export const toolsEl = $('tools');



export const settingsBtn = $<HTMLButtonElement>("btn-settings");
export const closeSettingsBtn = $<HTMLButtonElement>("btn-close-settings");
export const settingsPanel = $("settings-panel");
export const pauseBtn = $<HTMLButtonElement>('btn-pause');
export const resetBtn = $<HTMLButtonElement>('btn-reset');
export const sampleRange = $<HTMLInputElement>('sample-range');
export const sampleVal = $('sample-val');
export const exportBtn = $<HTMLButtonElement>('btn-export');
export const fileIn = $<HTMLInputElement>('file-input');
export const importBtn = $<HTMLButtonElement>('btn-import');
