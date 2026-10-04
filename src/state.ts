// 全局可变状态：桌面尺寸、模拟开关、桌面上的工具与波。
// 其他模块通过这个对象读写，避免各文件各自维护同名全局变量。

import type { Occluder, Wave } from './core/types';
import type { Tool } from './tools/Tool';


export const state = {
  deskW: 0,
  deskH: 0,
  dpr: 1,
  waveSpeed: 0,
  samples: 0,
  paused: false,
  items: new Array<Tool>(),
  waves: new Array<Wave>(),
  occluders: new Map<string, Occluder>(),
  occStale: true,
};

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