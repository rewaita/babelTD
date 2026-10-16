/**
 * 神の雷の演出: 画面上部から、停止したトラップの穴へギザギザの稲妻を落とす
 */
import Phaser from 'phaser';
import { DEPTH, VIEW } from '../config/visual';

/** 稲妻が見えている時間（秒） */
const BOLT_SEC = 0.45;
/** 稲妻の折れ曲がりの数と、横ぶれの大きさ（px） */
const BOLT_SEGMENTS = 9;
const BOLT_JITTER = 34;

interface Bolt {
  points: { x: number; y: number }[];
  start: number;
}

export class LightningFx {
  private readonly g: Phaser.GameObjects.Graphics;
  private bolts: Bolt[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.FLOAT_TEXT);
  }

  /** 画面座標 (x, y) へ稲妻を落とす */
  strike(x: number, y: number, time: number): void {
    const top = VIEW.TOP_BAR_HEIGHT;
    const points = [{ x: x + (Math.random() - 0.5) * 120, y: top }];
    for (let i = 1; i < BOLT_SEGMENTS; i++) {
      const t = i / BOLT_SEGMENTS;
      const bx = points[0].x + (x - points[0].x) * t;
      points.push({ x: bx + (Math.random() - 0.5) * BOLT_JITTER * 2, y: top + (y - top) * t });
    }
    points.push({ x, y });
    this.bolts.push({ points, start: time });
  }

  draw(time: number): void {
    const g = this.g;
    g.clear();
    this.bolts = this.bolts.filter((b) => time - b.start < BOLT_SEC);
    for (const b of this.bolts) {
      const a = 1 - (time - b.start) / BOLT_SEC;
      // 外側の光
      g.lineStyle(14, 0xfff6a0, 0.25 * a);
      g.strokePoints(b.points, false);
      // 芯
      g.lineStyle(4, 0xffffff, a);
      g.strokePoints(b.points, false);
      const end = b.points[b.points.length - 1];
      g.fillStyle(0xfff6a0, 0.6 * a);
      g.fillCircle(end.x, end.y, 30 * a + 8);
    }
  }
}
