// 桌面上的可拖拽工具基类：物理、拖拽、序列化统一在这里。
// 外观 / 发声 / 遮挡等能力由子类覆写，基类只给安全默认值。

import { GRID, GRAVITY, FRICTION, RESTITUTION } from '../core/constants';
import type { UniSeg, SerializedItem } from '../core/types';
import { clamp } from '../core/math';
import { state } from '../core/state';
import { deskEl } from '../ui/dom';
import { createContextMenu, openMenu, closeMenu } from '../ui/menu';

const QUART_GRID = GRID / 4;

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

  protected onMove(px: number, py: number): void {
    this.px = clamp(px, 0, Math.max(0, state.deskW - this.w));
    this.py = clamp(py, 0, Math.max(0, state.deskH - this.h));
    this.render();
  }

  protected onClick(): void { }

  protected onRelease(): void {
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

  get occluder(): UniSeg | null { return null; }

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
      const X = this.px;
      const Y = this.py;
      let moved = false;
      this.dragging = true;
      this.el.classList.add('dragging');
      this.vx = 0;
      this.vy = 0;
      const onPointerMove = (ev: PointerEvent): void => {
        const dx = ev.clientX - startX;
        const dy = startY - ev.clientY;
        if (moved) {
          this.onMove(X + dx, Y + dy);
          this.grounded = false;
        }
        else { moved = dx * dx + dy * dy > 16; }
      };
      const onPointerUp = (_ev: PointerEvent): void => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        this.dragging = false;
        this.el.classList.remove('dragging');
        if (moved) { this.onRelease(); state.occStale = true; }
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
    this.x = Math.round(this.px / GRID)
    this.y = Math.round(this.py / GRID)
    this.px = this.x * GRID;
    this.py = this.y * GRID;
  }

  protected findPlatformLanding(oldBottom: number, newBottom: number): number | null {
    // vy < 0 表示正在下落
    if (this.vy >= 0) { return null; }
    for (const platform of state.items) {
      if (platform.removed) { continue; }
      if (platform === this) { continue; }
      if (!(platform.constructor as typeof Tool).isPlatform) { continue; }
      if (this.px + this.w <= platform.px + 1) { continue; }
      if (this.px > platform.px + platform.w - 1) { continue; }
      const platformTop = platform.py + platform.h;
      if (oldBottom < platformTop - QUART_GRID) { continue; }
      if (newBottom > platformTop + QUART_GRID) { continue; }
      return platformTop;
    }
    return null;
  }

  protected findLanding(dt: number): LandingResult {
    const oldBottom = this.py;
    const newBottom = this.py + this.vy * dt;
    // 地面：底部高度不能低于 0
    if (newBottom <= 0) { return { landed: true, landingY: 0 }; }
    const platformY = this.findPlatformLanding(oldBottom, newBottom);
    if (platformY !== null) { return { landed: true, landingY: platformY }; }
    return { landed: false, landingY: 0 };
  }

  protected onLand(landY: number): void {
    this.py = landY;
    this.vy = 0;
    this.grounded = true;
  }

  protected applyGravity(dt: number): void {
    this.vy -= GRAVITY * dt;
    const landing = this.findLanding(dt);
    if (landing.landed) {
      this.onLand(landing.landingY);
    } else { this.py += this.vy * dt; }
  }

  protected applyFriction(dt: number): void {
    if (this.grounded) {
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
    if (this.grounded) {
      if (this.vx !== 0) {
        this.applyFriction(dt);
        this.grounded = this.findLanding(dt).landed;
        this.applyRebound();
      }
    }
    else {
      this.applyGravity(dt);
      if (this.vx !== 0) {
        this.px += this.vx * dt;
        this.applyRebound();
      }
    }
  }

  update(dt: number): void {
    const C = this.constructor as typeof Tool;
    if (C.physics && !this.dragging) {
      this.stepPhysics(dt);
      if (this.isStable) { this.onStable(); }
    }
    this.onTick(dt);
    this.render();
  }

  render(): void {
    // py 是底部高度，屏幕 translate 从上往下算
    this.el.style.transform = `translate(${this.px}px, ${state.deskH - this.py - this.h}px)`;
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

export class FixedQueue<T> {
  private items: T[];
  private readonly capacity: number;

  /**
   * 构造函数
   * @param capacity 队列的最大容量
   * @param initialItems 可选的初始数据
   */
  constructor(capacity: number, initialItems: T[] = []) {
    if (capacity <= 0) {
      throw new Error("队列容量必须大于 0");
    }
    this.capacity = capacity;
    // 如果初始数据超过容量，截取前 capacity 个
    this.items = initialItems.slice(0, capacity);
  }

  /**
   * 获取当前队列长度
   */
  get length(): number { return this.items.length; }
  /**
   * 向队列末尾添加元素
   * 如果队列已满，则移除最前面的元素（先进先出原则）以腾出空间
   * @param item 要添加的元素
   * @returns 当前队列实例，支持链式调用
   */
  append(item: T): this {
    while (this.items.length >= this.capacity) { this.items.shift(); }
    this.items.push(item);
    return this;
  }

  /**
   * 通过索引获取元素
   * 支持负数索引：-1 代表最后一个元素，-2 代表倒数第二个，以此类推
   * @param index 索引值
   * @returns 元素或 undefined（如果索引越界）
   */
  at(index: number) {
    if (index < 0) { return this.items[this.items.length + index]; }
    return this.items[index];
  }

  toArray() {
    return [...this.items];
  }
}