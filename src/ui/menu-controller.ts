// 菜单的开合与定位。菜单内容由各工具的 onContextMenu 提供。

import type { Tool } from '../tools/Tool';
import { menuEl } from './dom';

let openItem: Tool | null = null;
let openAt = { x: 0, y: 0 };

export function openMenu(clientX: number, clientY: number, item: Tool): void {
  openItem = item;
  openAt = { x: clientX, y: clientY };
  menuEl.innerHTML = '';
  menuEl.appendChild((item.constructor as typeof Tool).contextMenu(item));
  menuEl.classList.add('open');
  menuEl.setAttribute('aria-hidden', 'false');
  placeMenu();
}

/** 若菜单仍指向该对象，则原地重建菜单内容。 */
export function refreshMenu(item: unknown): void {
  if (!openItem || openItem !== item) return;
  openMenu(openAt.x, openAt.y, openItem);
}

export function placeMenu(): void {
  menuEl.style.left = '0px';
  menuEl.style.top = '0px';
  const rect = menuEl.getBoundingClientRect();
  let x = openAt.x;
  let y = openAt.y;
  if (x + rect.width > window.innerWidth - 8) {
    x = window.innerWidth - rect.width - 8;
  }
  if (y + rect.height > window.innerHeight - 8) {
    y = window.innerHeight - rect.height - 8;
  }
  menuEl.style.left = `${Math.max(8, x)}px`;
  menuEl.style.top = `${Math.max(8, y)}px`;
}

export function closeMenu(): void {
  menuEl.classList.remove('open');
  menuEl.setAttribute('aria-hidden', 'true');
  menuEl.innerHTML = '';
  openItem = null;
}

/** 点击菜单外部时收起菜单。 */
export function isMenuOpen(): boolean {
  return menuEl.classList.contains('open');
}
