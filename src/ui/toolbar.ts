// 工具栏：按注册表生成「添加工具」按钮。

import { spawnTool } from '../tools/manager';
import { TOOL_REGISTRY } from '../tools/registry';
import { toolsEl } from './dom';

export function buildToolbar(): void {
  toolsEl.innerHTML = '';
  for (const C of TOOL_REGISTRY) {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.type = 'button';
    button.innerHTML = `<span class="ico">${C.icon}</span><span>${C.label}</span>`;
    button.title = `添加${C.label}（${C.size[0]}×${C.size[1]} 网格，隔音板可调整长度）`;
    button.addEventListener('click', () => {
      spawnTool(C);
    });
    toolsEl.appendChild(button);
  }
}
