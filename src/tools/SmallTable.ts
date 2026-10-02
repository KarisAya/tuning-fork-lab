// 小桌板：可站立的平台，不参与声学。

import { Tool } from './Tool';

export class SmallTable extends Tool {
  static label = '小桌板';
  static icon = '<i class="fa-solid fa-xmarks-lines"></i>';
  static size: readonly [number, number] = [6, 1];
  static gravity = false;
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
      <rect x="1" y="1" width="142" height="18" rx="6" fill="url(#table-top)" stroke="#d8b483" stroke-width="2"/>
      <rect class="hit-hint" x="0" y="0" width="144" height="24" rx="6"/>
    </svg>`;

  static onMove(item: Tool): void {
    item.snapToGrid();
  }

  static onRelease(item: Tool): void {
    item.snapToGrid();
    item.render();
  }
}
