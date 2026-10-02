// 拖拽：按下 → 跟随指针 → 松手交给工具自己的 onClick / onRelease。

import { clamp } from '../core/math';
import { state } from '../state';
import type { Tool } from '../tools/Tool';
import { closeMenu } from './menu-controller';

export function startDrag(event: PointerEvent, item: Tool): void {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  closeMenu();
  const startX = event.clientX;
  const startY = event.clientY;
  const offsetX = event.clientX - item.px;
  const offsetY = event.clientY - item.py;
  const track: Array<{ t: number; x: number; y: number }> = [];
  let moved = false;
  item.dragging = true;
  item.vx = 0;
  item.vy = 0;
  item.el.classList.add('dragging');
  const onPointerMove = (ev: PointerEvent): void => {
    moved ||= Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4;
    item.px = clamp(ev.clientX - offsetX, 0, Math.max(0, state.deskW - item.w));
    item.py = clamp(ev.clientY - offsetY, 0, Math.max(0, state.deskH - item.h));
    item.render();
    track.push({ t: performance.now(), x: ev.clientX, y: ev.clientY });
    while (track.length > 8) {
      track.shift();
    }
  };
  const onPointerUp = (ev: PointerEvent): void => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    item.dragging = false;
    item.el.classList.remove('dragging');
    const C = item.constructor as typeof Tool;
    if (!moved) {
      C.onClick(item, ev);
      item.render();
      return;
    }
    const first = track[0];
    let vx = 0;
    if (first) {
      const dt = (performance.now() - first.t) / 1000;
      if (dt > 0.01) {
        vx = (ev.clientX - first.x) / dt;
      }
    }
    if (C.physics) {
      item.vx = clamp(vx * 0.9, -2400, 2400);
      item.vy = 0;
      item.grounded = false;
    } else if (!item.hasSelfPropulsion) {
      item.vx = 0;
      item.vy = 0;
    }
    C.onRelease(item);
    item.render();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}
