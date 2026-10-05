// 右键菜单的通用零件：标题、按钮、行、滑杆、删除项。
// 这里不认识任何具体工具，只提供 DOM 拼装。
import type { Point } from '../core/types';
import { state } from '../core/state';
import type { Tool } from '../tools/Tool';
import { removeItem } from '../tools/manager';
import { menuEl } from './dom';

export function openMenu(at: Point, item: Tool): void {
  state.openItem.item = item;
  state.openItem.at = at;
  menuEl.innerHTML = '';
  menuEl.appendChild((item.constructor as typeof Tool).contextMenu(item));
  menuEl.classList.add('open');
  menuEl.setAttribute('aria-hidden', 'false');
  const rect = menuEl.getBoundingClientRect();
  let [x, y] = at;
  if (x + rect.width > window.innerWidth - 8) { x = window.innerWidth - rect.width - 8; }
  if (y + rect.height > window.innerHeight - 8) { y = window.innerHeight - rect.height - 8; }
  menuEl.style.left = `${Math.max(8, x)}px`;
  menuEl.style.top = `${Math.max(8, y)}px`;
}

export function closeMenu(): void {
  menuEl.classList.remove('open');
  menuEl.setAttribute('aria-hidden', 'true');
  menuEl.innerHTML = '';
  state.openItem.item = null;
}

export function createContextMenu(item: Tool, title: string) {
  const menu = document.createElement('div');
  const titleEl = document.createElement('div');
  titleEl.className = 'menu-title';
  titleEl.textContent = title;
  menu.appendChild(titleEl);
  const bodyEl = document.createElement('div');
  bodyEl.className = 'menu-body';
  menu.appendChild(bodyEl);
  const delButtonEl = document.createElement('button');
  delButtonEl.className = 'menu-danger';
  delButtonEl.type = 'button';
  delButtonEl.textContent = '删除该工具';
  delButtonEl.addEventListener('click', () => {
    removeItem(item);
    closeMenu();
  });
  menu.appendChild(delButtonEl);
  return [menu, bodyEl];
}

export function button(text: string, onClick: () => void, on = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `menu-btn${on ? ' on' : ''}`;
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

export function rowLabel(label: string, value?: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'menu-row';
  const left = document.createElement('span');
  left.className = 'menu-label';
  left.textContent = label;
  row.appendChild(left);
  if (value !== undefined) {
    const right = document.createElement('strong');
    right.className = 'menu-value';
    right.textContent = value;
    row.appendChild(right);
  }
  return row;
}

export function rangeControl(
  min: number,
  max: number,
  step: number,
  value: number,
  formatter: (value: number) => string,
  onInput: (value: number) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'menu-row';
  const slider = document.createElement('input');
  slider.className = 'menu-range';
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  const out = document.createElement('strong');
  out.className = 'menu-value';
  out.textContent = formatter(value);
  slider.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    out.textContent = formatter(v);
    onInput(v);
  });
  row.append(slider, out);
  return row;
}
