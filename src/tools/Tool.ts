// 桌面上的可拖拽工具基类：物理、拖拽、序列化统一在这里。
// 外观 / 发声 / 遮挡等能力由子类覆写，基类只给安全默认值。

import { FRICTION, GRAVITY, GRID, RESTITUTION } from '../core/constants';
import { clamp } from '../core/math';
import type { UniSeg, SerializedItem } from '../core/types';
import { state } from '../state';
import { deskEl } from '../ui/dom';
import { createContextMenu } from '../ui/menu';
import { openMenu, closeMenu } from '../ui/menu-controller';

interface LandingResult {
  landed: boolean;
  landingY: number;
}

export abstract class Tool {
  static size: readonly [number, number];
  static shape: string;
  static label: string;
  static icon: string;
  static isPlatform = false;
  static friction = FRICTION * GRAVITY;
  static physics = true;

  static contextMenu(item: Tool): HTMLElement { return createContextMenu(item, (item.constructor as typeof Tool).label)[0]; }

  get isStable(): boolean { return this.grounded && this.vx === 0; }

  protected onStable(): void { this.snapToGrid(); }

  protected onTick(_dt: number): void { }

  protected onDrag(): void {
    this.dragging = true;
    this.el.classList.add('dragging');
    this.vx = 0;
    this.vy = 0;
  }

  protected onMove(px: number, py: number): void {
    this.px = clamp(px, 0, Math.max(0, state.deskW - this.w));
    this.py = clamp(py, 0, Math.max(0, state.deskH - this.h));
    this.render();
  }

  protected onClick(): void { }

  protected onRelease(): void {
    this.dragging = false;
    this.el.classList.remove('dragging');
    if (!(this.constructor as typeof Tool).physics) { this.onStable(); }
    this.render();
  }

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

  get w(): number { return this.gw * GRID; }

  get h(): number { return this.gh * GRID; }

  get occluder(): UniSeg | null | null { return null; }


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
      if (event.button !== 0) { return; }
      event.preventDefault();
      closeMenu();
      const startX = event.clientX;
      const startY = event.clientY;
      const offsetX = event.clientX - this.px;
      const offsetY = event.clientY - this.py;
      let moved = false;
      this.onDrag();
      const onPointerMove = (ev: PointerEvent): void => {
        if (moved) {
          this.onMove(ev.clientX - offsetX, ev.clientY - offsetY)
        } else {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY
          moved = (dx * dx + dy * dy) > 16
        }
      };
      const onPointerUp = (_ev: PointerEvent): void => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (moved) { this.onRelease(); state.occluders.clear(); }
        else { this.onClick(); }
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
    this.el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(event.clientX, event.clientY, this);
    });
    this.render();
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
  }

  update(dt: number): void {
    const C = this.constructor as typeof Tool;
    if (C.physics && !this.dragging) {
      this.stepPhysics(dt)
      if (this.isStable) { this.onStable(); }
    }
    this.onTick(dt);
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

  keepInsideDesk(): void {
    const maxX = Math.max(0, state.deskW - this.w);
    const maxY = Math.max(0, state.deskH - this.h);
    this.px = clamp(this.px, 0, maxX);
    this.py = clamp(this.py, 0, maxY);
    this.x = Math.round(this.px / GRID);
    this.y = Math.round(this.py / GRID);
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


