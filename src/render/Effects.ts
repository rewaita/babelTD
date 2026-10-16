/**
 * 小さな演出: 敵を倒したときの煙（呪いが散る）
 * 粒の数・色・時間は下の定数で調整できる。
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/visual';

/** 1回の煙の粒の数 */
const PUFF_PARTICLES = 7;
/** 煙が消えるまでの秒数 */
const PUFF_SEC = 0.45;
/** 粒が飛び散る距離（px） */
const PUFF_SPREAD = 34;

interface Puff {
  x: number;
  y: number;
  color: number;
  scale: number;
  start: number;
  angles: number[];
}

export class Effects {
  private readonly g: Phaser.GameObjects.Graphics;
  private puffs: Puff[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.ENEMIES + 1);
  }

  /** 敵が散る煙を出す（scale は画面上の大きさの倍率） */
  puff(x: number, y: number, color: number, scale: number, time: number): void {
    const angles = Array.from({ length: PUFF_PARTICLES }, (_, i) => (i / PUFF_PARTICLES) * Math.PI * 2 + Math.random() * 0.5);
    this.puffs.push({ x, y, color, scale, start: time, angles });
  }

  draw(time: number): void {
    const g = this.g;
    g.clear();
    this.puffs = this.puffs.filter((p) => time - p.start < PUFF_SEC);
    for (const p of this.puffs) {
      const t = (time - p.start) / PUFF_SEC;
      const dist = PUFF_SPREAD * p.scale * (1 - (1 - t) * (1 - t));
      g.fillStyle(p.color, 0.7 * (1 - t));
      for (const a of p.angles) {
        g.fillCircle(p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist * 0.6 - t * 20 * p.scale, (7 - 4 * t) * p.scale);
      }
    }
  }
}
