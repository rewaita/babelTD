/**
 * ============================================================
 *  仮素材（テクスチャ）の自動生成
 * ============================================================
 * 画像ファイルを用意しなくても遊べるよう、図形を組み合わせて仮の絵を作っています。
 *
 * 【本番の絵に差し替える方法】
 *   1. public/assets/ に PNG を置く（例: public/assets/enemy_basic.png）
 *   2. BootScene の preload() で同じキー名で読み込む
 *        this.load.image('enemy_basic', 'assets/enemy_basic.png');
 *   3. 読み込んだキーは、ここでの生成をスキップする（textures.exists で判定済み）
 *
 * テクスチャのキー名:
 *   敵       … enemy_<敵のid>      （例: enemy_basic）
 *   トラップ … trap_<トラップのid> （例: trap_spike）
 *   作業員   … worker
 *   天才     … genius
 */
import Phaser from 'phaser';
import { ENEMIES, type EnemyDef } from '../config/enemies';
import { TRAPS, type TrapDef } from '../config/traps';
import { shade } from './color';

export function generateTextures(scene: Phaser.Scene): void {
  for (const e of ENEMIES) {
    if (!scene.textures.exists(`enemy_${e.id}`)) makeEnemy(scene, e);
  }
  for (const t of TRAPS) {
    if (!scene.textures.exists(`trap_${t.id}`)) makeTrap(scene, t);
  }
  if (!scene.textures.exists('worker')) makeWorker(scene);
  if (!scene.textures.exists('genius')) makeGenius(scene);
}

/** 敵: 丸い呪いの塊に目。look で角やトゲを付ける */
function makeEnemy(scene: Phaser.Scene, def: EnemyDef): void {
  const size = def.size;
  const w = size + 16;
  const h = size + 16;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cx = w / 2;
  const cy = h / 2 + 4;
  const r = size / 2;

  if (def.look === 'spiky') {
    g.fillStyle(shade(def.color, -0.3), 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      g.fillTriangle(
        cx + Math.cos(a - 0.3) * r * 0.8, cy + Math.sin(a - 0.3) * r * 0.8,
        cx + Math.cos(a + 0.3) * r * 0.8, cy + Math.sin(a + 0.3) * r * 0.8,
        cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7),
      );
    }
  }
  if (def.look === 'horned') {
    g.fillStyle(0xeee2c8, 1);
    g.fillTriangle(cx - r * 0.7, cy - r * 0.5, cx - r * 0.35, cy - r * 0.75, cx - r * 0.75, cy - r - 8);
    g.fillTriangle(cx + r * 0.7, cy - r * 0.5, cx + r * 0.35, cy - r * 0.75, cx + r * 0.75, cy - r - 8);
  }

  if (def.look === 'hopper') {
    // 跳ね型: 長い耳とバネのような足
    g.fillStyle(shade(def.color, -0.25), 1);
    g.fillEllipse(cx - r * 0.45, cy - r * 0.95, r * 0.35, r * 0.9);
    g.fillEllipse(cx + r * 0.45, cy - r * 0.95, r * 0.35, r * 0.9);
    g.lineStyle(3, shade(def.color, -0.45), 1);
    g.lineBetween(cx - r * 0.4, cy + r * 0.6, cx - r * 0.55, cy + r + 4);
    g.lineBetween(cx + r * 0.4, cy + r * 0.6, cx + r * 0.55, cy + r + 4);
  }
  if (def.look === 'giant') {
    // 大型: 肩の突起と王冠のような角
    g.fillStyle(shade(def.color, -0.4), 1);
    g.fillCircle(cx - r * 0.85, cy + r * 0.1, r * 0.35);
    g.fillCircle(cx + r * 0.85, cy + r * 0.1, r * 0.35);
    g.fillStyle(0xd9b45a, 1);
    for (let i = -2; i <= 2; i++) {
      g.fillTriangle(cx + i * r * 0.28 - 5, cy - r * 0.7, cx + i * r * 0.28 + 5, cy - r * 0.7, cx + i * r * 0.28, cy - r * 1.05 - 4);
    }
  }

  // 体（下が少し広い、ゆるい形）
  g.fillStyle(shade(def.color, -0.35), 1);
  g.fillEllipse(cx, cy + r * 0.15, r * 2.1, r * 1.8);
  g.fillStyle(def.color, 1);
  g.fillEllipse(cx, cy, r * 2, r * 1.8);
  g.fillStyle(shade(def.color, 0.35), 1);
  g.fillEllipse(cx - r * 0.35, cy - r * 0.4, r * 0.7, r * 0.45);

  // 目
  const eyeY = cy - r * 0.05;
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx - r * 0.33, eyeY, r * 0.26);
  g.fillCircle(cx + r * 0.33, eyeY, r * 0.26);
  g.fillStyle(0x1a0b24, 1);
  g.fillCircle(cx - r * 0.27, eyeY + 1, r * 0.13);
  g.fillCircle(cx + r * 0.39, eyeY + 1, r * 0.13);

  if (def.look === 'warded') {
    // 異常無効: 頭上の光輪
    g.lineStyle(3, 0xfff2a8, 1);
    g.strokeEllipse(cx, cy - r * 0.95, r * 1.3, r * 0.35);
  }

  g.generateTexture(`enemy_${def.id}`, w, h);
  g.destroy();
}

/** トラップ: 系統色の丸いプレートにアイコン */
function makeTrap(scene: Phaser.Scene, def: TrapDef): void {
  const s = 64;
  const c = s / 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(shade(def.color, -0.45), 1);
  g.fillCircle(c, c, 30);
  g.fillStyle(def.color, 1);
  g.fillCircle(c, c, 26);
  g.lineStyle(2, shade(def.color, 0.4), 1);
  g.strokeCircle(c, c, 26);

  switch (def.icon) {
    case 'spike':
      g.fillStyle(0xe8e8f0, 1);
      for (let i = -1; i <= 1; i++) {
        g.fillTriangle(c + i * 13 - 7, c + 13, c + i * 13 + 7, c + 13, c + i * 13, c - 15);
      }
      break;
    case 'glue':
      g.fillStyle(0xbff0a0, 1);
      g.fillCircle(c - 8, c + 4, 9);
      g.fillCircle(c + 9, c + 7, 7);
      g.fillCircle(c + 2, c - 9, 6);
      g.fillTriangle(c - 4, c - 22, c + 8, c - 8, c - 4, c - 8);
      break;
    case 'blade': {
      g.fillStyle(0xf2f2f5, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillTriangle(
          c + Math.cos(a) * 10, c + Math.sin(a) * 10,
          c + Math.cos(a + 0.5) * 10, c + Math.sin(a + 0.5) * 10,
          c + Math.cos(a + 0.15) * 22, c + Math.sin(a + 0.15) * 22,
        );
      }
      g.fillCircle(c, c, 12);
      g.fillStyle(0x555a66, 1);
      g.fillCircle(c, c, 5);
      break;
    }
    case 'poison':
      // 毒: しずくとドクロ風の目
      g.fillStyle(0xc8f07a, 1);
      g.fillCircle(c, c + 5, 13);
      g.fillTriangle(c - 11, c, c + 11, c, c, c - 20);
      g.fillStyle(0x3a1850, 1);
      g.fillCircle(c - 5, c + 4, 3);
      g.fillCircle(c + 5, c + 4, 3);
      g.fillRect(c - 4, c + 11, 8, 3);
      break;
    case 'weaken':
      // 脆化: ひびの入った盾
      g.fillStyle(0xe8d0a8, 1);
      g.fillTriangle(c - 16, c - 14, c + 16, c - 14, c, c + 20);
      g.fillRect(c - 16, c - 18, 32, 6);
      g.lineStyle(3, 0x5a2a10, 1);
      g.lineBetween(c - 2, c - 16, c + 4, c - 4);
      g.lineBetween(c + 4, c - 4, c - 4, c + 6);
      g.lineBetween(c - 4, c + 6, c + 1, c + 14);
      break;
    case 'gust':
      // 突風: うず巻く風の線
      g.lineStyle(4, 0xe0f4ff, 1);
      g.beginPath();
      g.arc(c, c, 14, Math.PI * 0.1, Math.PI * 1.6, false);
      g.strokePath();
      g.beginPath();
      g.arc(c, c, 7, Math.PI * 1.1, Math.PI * 2.4, false);
      g.strokePath();
      g.lineBetween(c - 20, c + 14, c + 2, c + 14);
      break;
    case 'pit':
      // 落とし穴: 黒い穴と下向きの矢印
      g.fillStyle(0x0c0812, 1);
      g.fillEllipse(c, c + 10, 40, 16);
      g.fillStyle(0xff8a5a, 1);
      g.fillRect(c - 4, c - 20, 8, 16);
      g.fillTriangle(c - 11, c - 6, c + 11, c - 6, c, c + 6);
      break;
    case 'bell':
      g.fillStyle(0xfff0b0, 1);
      g.fillEllipse(c, c - 2, 30, 34);
      g.fillRect(c - 18, c + 8, 36, 7);
      g.fillCircle(c, c + 18, 5);
      g.fillStyle(0x8a6418, 1);
      g.fillRect(c - 3, c - 22, 6, 6);
      break;
  }
  g.generateTexture(`trap_${def.id}`, s, s);
  g.destroy();
}

/** 作業員: ヘルメットをかぶった小さな人 */
function makeWorker(scene: Phaser.Scene): void {
  const w = 28;
  const h = 40;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // 脚
  g.fillStyle(0x3b3550, 1);
  g.fillRect(8, 28, 5, 12);
  g.fillRect(15, 28, 5, 12);
  // 体
  g.fillStyle(0x3f7fd0, 1);
  g.fillRoundedRect(6, 15, 16, 15, 4);
  // 頭
  g.fillStyle(0xf2c9a0, 1);
  g.fillCircle(14, 11, 6);
  // ヘルメット
  g.fillStyle(0xffd23f, 1);
  g.fillEllipse(14, 7, 15, 8);
  g.fillRect(6, 7, 16, 2);
  // 槌
  g.fillStyle(0x8a5a2b, 1);
  g.fillRect(22, 10, 3, 14);
  g.fillStyle(0x9aa0aa, 1);
  g.fillRect(19, 7, 9, 5);
  g.generateTexture('worker', w, h);
  g.destroy();
}

/** 天才: 金色の光をまとった人型 */
function makeGenius(scene: Phaser.Scene): void {
  const w = 64;
  const h = 72;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // 後光
  g.fillStyle(0xffe27a, 0.35);
  g.fillCircle(w / 2, 26, 26);
  g.fillStyle(0xffe27a, 0.6);
  g.fillCircle(w / 2, 26, 18);
  // 体（ローブ）
  g.fillStyle(0xf4f0e6, 1);
  g.fillTriangle(w / 2, 30, w / 2 - 18, h - 2, w / 2 + 18, h - 2);
  g.fillStyle(0xd9a93a, 1);
  g.fillRect(w / 2 - 14, h - 14, 28, 4);
  // 頭
  g.fillStyle(0xf2c9a0, 1);
  g.fillCircle(w / 2, 24, 10);
  // ひらめきの星
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(w / 2 + 16, 4, w / 2 + 20, 12, w / 2 + 12, 12);
  g.fillTriangle(w / 2 + 16, 18, w / 2 + 20, 10, w / 2 + 12, 10);
  g.generateTexture('genius', w, h);
  g.destroy();
}
