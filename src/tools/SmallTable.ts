import { clamp } from '../core/math';
import type { SerializedItem } from '../core/types';
import { Tool } from './Tool';
import { createContextMenu, rangeControl, rowLabel } from '../ui/menu';

const DEFAULT_WIDTH = 6;
const DEFAULT_HEIGHT = 1;

export class SmallTable extends Tool {

  static label = '小桌板';

  static icon = '<i class="fa-solid fa-xmarks-lines"></i>';

  static size: readonly [number, number] = [DEFAULT_WIDTH, DEFAULT_HEIGHT];

  static isPlatform = true;

  static shape = `
    <svg viewBox="0 0 144 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="table-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b68857"/>
          <stop offset="1" stop-color="#553d25"/>
        </linearGradient>
      </defs>
      <rect x="9" y="18" width="10" height="6" rx="2" fill="#3a2a1c"/>
      <rect x="125" y="18" width="10" height="6" rx="2" fill="#3a2a1c"/>
      <rect x="1" y="1" width="142" height="18" rx="6"
        fill="url(#table-top)" stroke="#d8b483" stroke-width="2"/>
      <rect class="hit-hint" x="0" y="0" width="144" height="24" rx="6"/>
    </svg>
  `;

  constructor(gx: number, gy: number) {
    super(gx, gy);
    this.applyGeom();
  }

  applyGeom(): void {
    this.gw = clamp(this.gw, 1, 12);
    this.gh = clamp(this.gh, 1, 12);

    const w = this.w;
    const h = this.h;

    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;

    this.el.innerHTML = `\
 <svg viewBox="0 0 ${Math.max(1, w)} ${Math.max(1, h)}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
  <defs>
    <linearGradient id="table-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b68857"/>
      <stop offset="1" stop-color="#553d25"/>
    </linearGradient>
  </defs>
 <rect x="0" y="0" width="${Math.max(1, w)}" height="${Math.max(1, h)}" rx="${Math.min(6, Math.max(1, h / 2))}" fill="url(#table-top)" stroke="#d8b483" stroke-width="${Math.min(2, Math.max(1, h / 6))}"/>
 <rect class="hit-hint" x="0"y="0" width="${Math.max(1, w)}" height="${Math.max(1, h)}" rx="${Math.min(6, Math.max(1, h / 2))}"/>
</svg>`;
  }

  static contextMenu(item: SmallTable): HTMLElement {
    const [root, body] = createContextMenu(item, this.label);
    body.appendChild(rowLabel('宽度'));
    body.appendChild(rangeControl(1, 12, 1, item.gw, v => `${Math.round(v)} 格`, v => { item.gw = clamp(Math.round(v), 1, 12); item.applyGeom(); }));
    body.appendChild(rowLabel('高度'));
    body.appendChild(rangeControl(1, 12, 1, item.gh, v => `${Math.round(v)} 格`, v => { item.gh = clamp(Math.round(v), 1, 12); item.applyGeom(); }));
    return root;
  }

  serialize(): SerializedItem {
    return { ...super.serialize(), gw: this.gw, gh: this.gh };
  }

  deserialize(data: SerializedItem): void {
    super.deserialize(data);
    if (typeof data.gw === 'number') { this.gw = clamp(Math.round(data.gw), 1, 12); }
    if (typeof data.gh === 'number') { this.gh = clamp(Math.round(data.gh), 1, 12); }
    this.applyGeom();
  }
}