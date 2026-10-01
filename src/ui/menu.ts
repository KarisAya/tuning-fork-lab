// 右键菜单的通用零件：标题、按钮、行、滑杆、删除项。
// 这里不认识任何具体工具，只提供 DOM 拼装。

import type { Removable } from '../core/types';
import { removeItem } from '../tools/manager';
import { closeMenu } from './menu-controller';

export function menuTitle(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'menu-title';
  el.textContent = text;
  return el;
}

export function delButton(item: Removable): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'menu-danger';
  button.type = 'button';
  button.textContent = '删除该工具';
  button.addEventListener('click', () => {
    removeItem(item);
    closeMenu();
  });
  return button;
}

export function createContextMenu(item: Removable, title: string): HTMLDivElement {
  const root = document.createElement('div');
  root.appendChild(menuTitle(title));
  const body = document.createElement('div');
  body.className = 'menu-body';
  root.appendChild(body);
  root.appendChild(delButton(item));
  return root;
}

export function menuBody(root: HTMLElement): HTMLElement {
  return root.querySelector('.menu-body') as HTMLElement;
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
