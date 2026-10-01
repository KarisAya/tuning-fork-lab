// 隔音板菜单。参数用结构性接口描述，因此不依赖 EchoBoard 这个具体类。

import type { BoardDirection, Removable } from '../../core/types';
import { button, createContextMenu, menuBody, rangeControl, rowLabel } from '../menu';
import { refreshMenu } from '../menu-controller';

export interface BoardControls extends Removable {
  dir: BoardDirection;
  len: number;
  reflect: boolean;
  applyGeom(): void;
}

export function buildBoardMenu(item: BoardControls): HTMLElement {
  const root = createContextMenu(item, '隔音板');
  const body = menuBody(root);
  const dirRow = rowLabel('方向');
  const dirBtns = document.createElement('div');
  dirBtns.className = 'menu-row';
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
  reflectRow.className = 'menu-row';
  reflectRow.append(
    button('开启反射', () => {
      item.reflect = true;
      refreshMenu(item);
    }, item.reflect),
    button('关闭反射', () => {
      item.reflect = false;
      refreshMenu(item);
    }, !item.reflect),
  );
  body.appendChild(reflectRow);
  const note = document.createElement('div');
  note.className = 'menu-note';
  note.textContent = '反射只有开启/关闭两种状态。隔音板命中后只遮挡对应方向，未命中区域继续显示。';
  body.appendChild(note);
  return root;
}
