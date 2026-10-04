// 隔音板 / 回音板：波遮挡体，可切方向、调长度、开关反射。

import { GRID } from '../core/constants';
import { clamp } from '../core/math';
import type { Segment, UniSeg, SerializedItem } from '../core/types';
import { state } from '../state';
import { Tool } from './Tool';
import { button, createContextMenu, rangeControl, rowLabel } from '../ui/menu';
import { refreshMenu } from '../ui/menu-controller';

type BoardDirection = 'v' | 'h';
const DEFAULT_LEN = 12;

export class EchoBoard extends Tool {
  static label = '隔音板';
  static icon = '<i class="fa-regular fa-square"></i>';
  static size: readonly [number, number] = [1, 12];
  static physics = false;
  static shape = `\
<svg viewBox="0 0 100 100">
  <rect class="hit-hint" x="0" y="0" width="100" height="100" rx="8" />
  <rect class="board-visual" x="2" y="0" width="12" height="100" rx="6" />
</svg>`;

  dir: BoardDirection = 'v';
  len: number = DEFAULT_LEN;
  reflect: boolean = true;
  constructor(gx: number, gy: number) {
    super(gx, gy);
    this.applyGeom();
  }
  get occluder() {
    if (this.removed) { return null; }
    if (this.dragging) { return null; }
    const key = `${this.px},${this.py},${this.gw},${this.gh},${this.dir},${this.len}`;
    const px = this.px
    const py = this.py
    const seg = (this.dir === 'h' ? [[px, py], [this.px + this.gw * GRID, py]] : [[px, py], [px, py + this.gh * GRID]]) as Segment;
    return [key, seg, this.reflect] as UniSeg
  }
  applyGeom(): void {
    const isH = this.dir === 'h';
    if (isH) {
      this.gw = this.len;
      this.gh = 1;
    } else {
      this.gw = 1;
      this.gh = this.len;
    }
    const w = this.w;
    const h = this.h;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    const x = 0;
    const [y, width, height] = isH ? [h - 5, w, 5] : [0, 5, h];
    this.el.innerHTML = `\
<svg viewBox="0 0 ${Math.max(1, w)} ${Math.max(1, h)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="board-metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4f8ff"/>
      <stop offset=".5" stop-color="#86b3f0"/>
      <stop offset="1" stop-color="#456fc0"/>
    </linearGradient>
    <filter id="board-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect class="hit-hint" x="0" y="0" width="${w}" height="${h}" rx="5"/>
  <rect x="${x + 1}" y="${y + 1}" width="${Math.max(1, width - 2)}" height="${Math.max(1, height - 2)}" rx="2.5" fill="url(#board-metal)" filter="url(#board-glow)"/>
</svg>`;
    if (state.deskW) { this.render(); }
    state.occStale = true;
  }
  static contextMenu(item: EchoBoard): HTMLElement {
    const [root, body] = createContextMenu(item, this.label);
    const dirRow = rowLabel('方向');
    const dirBtns = document.createElement('div');
    dirBtns.className = 'menu-row menu-row-cells';
    dirBtns.append(
      button('竖 · 占左侧', () => {
        item.dir = 'v';
        item.applyGeom();
        refreshMenu(item);
      }, item.dir === 'v'),
      button('横 · 占下侧', () => {
        item.dir = 'h';
        item.applyGeom();
        refreshMenu(item);
      }, item.dir === 'h'),
    );
    body.append(dirRow, dirBtns);
    body.appendChild(rowLabel('长度'));
    body.appendChild(rangeControl(3, 24, 1, item.len, (v) => `${Math.round(v)} 格`, (v) => {
      item.len = Math.round(v);
      item.applyGeom();
    }));
    body.appendChild(rowLabel('反射'));
    const reflectRow = document.createElement('div');
    reflectRow.className = 'menu-row menu-row-cells';
    reflectRow.append(
      button('开启反射', () => {
        item.reflect = true;
        state.occStale = true;
        refreshMenu(item);
      }, item.reflect),
      button('关闭反射', () => {
        item.reflect = false;
        refreshMenu(item);
        state.occStale = true;
      }, !item.reflect),
    );
    body.appendChild(reflectRow);
    const note = document.createElement('div');
    note.className = 'menu-note';
    note.textContent = '隔音板可以隔开声波，但是会反射。';
    body.appendChild(note);
    return root;
  }
  serialize(): SerializedItem {
    return {
      ...super.serialize(),
      dir: this.dir,
      len: this.len,
      reflect: this.reflect,
    };
  }
  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    if (data.dir === 'h' || data.dir === 'v') { this.dir = data.dir; }
    if (typeof data.len === 'number') { this.len = clamp(Math.round(data.len), 3, 24); }
    if (typeof data.reflect === 'boolean') { this.reflect = data.reflect; }
    this.applyGeom();
  }
}
