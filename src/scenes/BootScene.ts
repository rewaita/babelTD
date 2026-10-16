/**
 * 起動シーン: 素材の読み込みと仮素材の生成をしてから、ゲーム本編へ移る
 */
import Phaser from 'phaser';
import { generateTextures } from '../render/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // 本番の画像を使うときはここで読み込む（キー名は src/render/textures.ts を参照）
    // 例: this.load.image('enemy_basic', 'assets/enemy_basic.png');
  }

  create(): void {
    generateTextures(this);
    this.scene.start('Game');
  }
}
