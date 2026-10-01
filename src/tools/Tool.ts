// 桌面上的可拖拽工具基类：物理、拖拽、序列化统一在这里。
// 外观 / 发声 / 遮挡等能力由子类覆写，基类只给安全默认值。

import { FRICTION, GRAVITY, GRID, RESTITUTION } from '../core/constants';
import { clamp } from '../core/math';
import type { Point, Segment, SerializedItem } from '../core/types';
import { state } from '../state';
import { deskEl } from '../ui/dom';
import { startDrag } from '../ui/drag';
import { createContextMenu } from '../ui/menu';
import { openMenu } from '../ui/menu-controller';

export class Tool {
  static shape = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="12" fill="#8fb6ff"/></svg>';
  static size: readonly [number, number] = [2, 2];
  static label = '工具';
  static icon = '▢';
  static gravity = true;
  static isPlatform = false;

  /** 新增工具时的默认纵向落点（网格）。 */
  static spawnY(maxGY: number): number {
    return this.gravity ? 0 : Math.max(0, Math.floor(maxGY / 2));
  }

  static onMove(_item: Tool, _dt: number): void { }
  static onClick(_item: Tool, _evt?: PointerEvent): void { }
  static onContextMenu(item: Tool): HTMLElement {
    return createContextMenu(item, (item.constructor as typeof Tool).label);
  }
  static onRelease(_item: Tool): void { }

  type: string;
  gw: number;
  gh: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx = 0;
  vy = 0;
  grounded = false;
  dragging = false;
  removed = false;
  el: HTMLDivElement;

  constructor(gx: number, gy: number) {
    const C = this.constructor as typeof Tool;
    this.type = C.name;
    this.gw = C.size[0];
    this.gh = C.size[1];
    this.x = Math.round(gx);
    this.y = Math.round(gy);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
    this.el = document.createElement('div');
    this.el.className = 'item';
    this.el.style.width = `${this.gw * GRID}px`;
    this.el.style.height = `${this.gh * GRID}px`;
    this.el.innerHTML = C.shape;
    deskEl.appendChild(this.el);
    this.el.addEventListener('pointerdown', (event) => {
      startDrag(event, this);
    });
    this.el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(event.clientX, event.clientY, this);
    });
    this.render();
  }

  get w(): number {
    return this.gw * GRID;
  }

  get h(): number {
    return this.gh * GRID;
  }

  getEmissionPoint(): Point {
    return [this.px + this.w / 2, this.py + this.h / 2];
  }

  /** 是否作为波的遮挡体：隔音板 / 回音板覆写。 */
  get occludesWaves(): boolean {
    return false;
  }

  /** 是否反射波。 */
  get reflectsWaves(): boolean {
    return false;
  }

  /** 作为遮挡体的几何线段；默认无。 */
  occluderSegment(): Segment | null {
    return null;
  }

  /** 遮挡体几何指纹，用于衍射分支去重。 */
  occluderKey(): string {
    return `${this.px},${this.py},${this.w},${this.h}`;
  }

  /** 拖拽松手后是否保留自身速度（自走工具覆写）。 */
  get hasSelfPropulsion(): boolean {
    return false;
  }

  fitElement(): void {
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
  }

  keepInsideDesk(): void {
    const maxX = Math.max(0, state.deskW - this.w);
    const maxY = Math.max(0, state.deskH - this.h);
    this.px = clamp(this.px, 0, maxX);
    this.py = clamp(this.py, 0, maxY);
    this.x = Math.round(this.px / GRID);
    this.y = Math.round(this.py / GRID);
  }

  snapToGrid(): void {
    const maxGX = Math.max(0, Math.floor((state.deskW - this.w) / GRID));
    const maxGY = Math.max(0, Math.floor((state.deskH - this.h) / GRID));
    this.x = clamp(Math.round(this.px / GRID), 0, maxGX);
    this.y = clamp(Math.round(this.py / GRID), 0, maxGY);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
  }

  /** 当前正下方可站立的支撑面高度。 */
  supportY(): number {
    const floor = state.deskH - this.h;
    let support = floor;
    for (const platform of state.items) {
      if (platform === this || platform.removed || !(platform.constructor as typeof Tool).isPlatform) {
        continue;
      }
      if (this.px + this.w <= platform.px + 1 || this.px >= platform.px + platform.w - 1) {
        continue;
      }
      const top = platform.py - this.h;
      if (top <= this.py + 2 && top < support) {
        support = top;
      }
    }
    return support;
  }

  stepPhysics(dt: number): void {
    const floor = state.deskH - this.h;
    if (!this.grounded) {
      this.vy += GRAVITY * dt;
      const oldBottom = this.py + this.h;
      this.py += this.vy * dt;
      const newBottom = this.py + this.h;
      let landed = false;
      if (newBottom >= state.deskH) {
        this.py = floor;
        landed = true;
      } else {
        for (const platform of state.items) {
          if (platform === this || platform.removed || !(platform.constructor as typeof Tool).isPlatform) {
            continue;
          }
          if (this.px + this.w <= platform.px + 1 || this.px >= platform.px + platform.w - 1) {
            continue;
          }
          if (oldBottom <= platform.py + 0.5 && newBottom >= platform.py) {
            this.py = platform.py - this.h;
            landed = true;
            break;
          }
        }
      }
      if (landed) {
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      const support = this.supportY();
      if (this.py < support - 1) {
        this.grounded = false;
        this.vy = 0;
      } else {
        this.py = support;
        this.vy = 0;
      }
    }
    if (this.grounded) {
      const dec = FRICTION * dt;
      if (Math.abs(this.vx) <= dec) {
        this.vx = 0;
      } else {
        this.vx -= Math.sign(this.vx) * dec;
      }
    }
    this.px += this.vx * dt;
    if (this.px < 0) {
      this.px = 0;
      this.vx = Math.abs(this.vx) > 30 ? -this.vx * RESTITUTION : 0;
    } else if (this.px + this.w > state.deskW) {
      this.px = state.deskW - this.w;
      this.vx = Math.abs(this.vx) > 30 ? -this.vx * RESTITUTION : 0;
    }
    if (this.grounded && this.vx === 0) {
      this.snapToGrid();
    }
  }

  update(dt: number): void {
    const C = this.constructor as typeof Tool;
    if (!this.dragging && C.gravity) {
      this.stepPhysics(dt);
    }
    C.onMove(this, dt);
    this.render();
  }

  render(): void {
    this.el.style.transform = `translate(${this.px}px,${this.py}px)`;
  }

  serialize(): SerializedItem {
    return {
      type: this.type,
      x: Math.round(this.px / GRID),
      y: Math.round(this.py / GRID),
    };
  }

  deserialize(data: SerializedItem): void {
    this.x = Math.round(typeof data.x === 'number' ? data.x : 0);
    this.y = Math.round(typeof data.y === 'number' ? data.y : 0);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.keepInsideDesk();
    this.render();
  }

  remove(): void {
    this.removed = true;
    this.el.remove();
  }
}
