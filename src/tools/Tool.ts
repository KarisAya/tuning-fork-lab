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

interface LandingResult {
  landed: boolean;
  landingY: number;
}

export class Tool {
  static shape = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="12" fill="#8fb6ff"/></svg>';
  static size: readonly [number, number] = [2, 2];
  static label = '工具';
  static icon = '▢';
  static physics = true;
  static isPlatform = false;
  static friction = FRICTION * GRAVITY;

  /** 新增工具时的默认纵向落点（网格）。 */
  static spawnY(maxGY: number): number {
    return this.physics ? 0 : Math.max(0, Math.floor(maxGY / 2));
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

  get w(): number { return this.gw * GRID; }

  get h(): number { return this.gh * GRID; }

  /** 是否作为波的遮挡体 */
  get occludesWaves(): boolean { return false; }

  /** 是否反射波。 */
  get reflectsWaves(): boolean { return false; }

  /** 作为遮挡体的几何线段；默认无。 */
  occluderSegment(): Segment | null { return null; }

  /** 遮挡体几何指纹，用于衍射分支去重。 */
  occluderKey(): string { return `${this.px},${this.py},${this.w},${this.h}`; }

  /** 拖拽松手后是否保留自身速度。 */
  get hasSelfPropulsion(): boolean { return false; }

  fitElement(): void {
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
  }

  protected snapToGrid(): void {
    const maxGX = Math.max(0, Math.floor((state.deskW - this.w) / GRID));
    const maxGY = Math.max(0, Math.floor((state.deskH - this.h) / GRID));
    this.x = clamp(Math.round(this.px / GRID), 0, maxGX);
    this.y = clamp(Math.round(this.py / GRID), 0, maxGY);
    this.px = this.x * GRID;
    this.py = this.y * GRID;
  }
  protected findPlatformLanding(oldBottom: number, newBottom: number,): number | null {
    if (this.vy <= 0) { return null; }
    for (const platform of state.items) {
      if (platform.removed) { continue; }
      if (platform === this) { continue; }
      if (!(platform.constructor as typeof Tool).isPlatform) { continue; }
      if (this.px + this.w <= platform.px + 1) { continue; }
      if (this.px > platform.px + platform.w - 1) { continue; }
      if (oldBottom > platform.py + 0.5) { continue; }
      if (newBottom < platform.py) { continue; }
      return platform.py;
    }
    return null;
  }

  protected findLanding(dt: number): LandingResult {
    const oldBottom = this.py + this.h;
    const newBottom = this.py + this.vy * dt + this.h;
    // 地面
    if (newBottom >= state.deskH) { return { landed: true, landingY: state.deskH - this.h }; }
    // 平台
    const platformY = this.findPlatformLanding(oldBottom, newBottom);
    if (platformY !== null) { return { landed: true, landingY: platformY - this.h, }; }
    return { landed: false, landingY: 0, };
  }
  protected applyGravity(dt: number): void {
    this.vy += GRAVITY * dt
    const landing = this.findLanding(dt);
    if (landing.landed) {
      this.py = landing.landingY;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.py += this.vy * dt;
      this.grounded = false;
    }
  }

  protected applyFriction(dt: number): void {
    if (!this.grounded) {
      const C = this.constructor as typeof Tool;
      const friction = C.friction * dt;
      if (this.vx > friction) { this.vx -= friction; }
      else if (this.vx < -friction) { this.vx += friction; }
      else { this.vx = 0; }
    }
    this.px += this.vx * dt;
  }
  isStable(): boolean { return this.grounded && this.vx === 0 }

  protected applyRebound(): void {
    if (this.px < 0) {
      this.px = 0;
      this.vx = -this.vx * RESTITUTION;
    } else if (this.px + this.w > state.deskW) {
      this.px = state.deskW - this.w;
      this.vx = -this.vx * RESTITUTION;
    }
  }
  protected stepPhysics(dt: number): void {
    this.applyGravity(dt);
    this.applyFriction(dt);
    this.applyRebound();
    if (this.isStable()) { this.snapToGrid(); }
  }

  update(dt: number): void {
    const C = this.constructor as typeof Tool;
    if (C.physics && !this.dragging) { this.stepPhysics(dt) }
    C.onMove(this, dt);
    this.render();
  }

  protected render(): void {
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
    const x = Math.round(typeof data.x === 'number' ? data.x : 0);
    const y = Math.round(typeof data.y === 'number' ? data.y : 0);
    const maxX = Math.max(0, state.deskW - this.w);
    const maxY = Math.max(0, state.deskH - this.h);
    this.px = clamp(x * GRID, 0, maxX);
    this.py = clamp(y * GRID, 0, maxY);
    this.x = Math.round(this.px / GRID);
    this.y = Math.round(this.py / GRID);
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.render();
  }

  remove(): void {
    this.removed = true;
    this.el.remove();
  }
}


