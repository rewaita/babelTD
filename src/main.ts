/**
 * エントリーポイント: Phaser のゲームを起動する
 *
 * 画面の幅は論理720pxで固定し、高さは端末の縦横比に合わせて決める。
 * （縦長のスマホでは縦に広く、PCでは縦画面の枠として表示される）
 */
import Phaser from 'phaser';
import { VIEW } from './config/visual';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { DEBUG } from './debug';
import { unlockAudio } from './audio/context';
import { bgm } from './audio/Bgm';

const parent = document.getElementById('app')!;
const aspect = parent.clientHeight / Math.max(1, parent.clientWidth);
const height = Math.round(Phaser.Math.Clamp(VIEW.WIDTH * aspect, VIEW.MIN_HEIGHT, VIEW.MAX_HEIGHT));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0b0816',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW.WIDTH,
    height,
  },
  input: { activePointers: 2 },
  render: { antialias: true },
  scene: [BootScene, GameScene],
});

// 最初のタップ（キー入力）で音を出せるようにし、BGMを鳴らし始める（スマホのブラウザの制限への対応）
const startAudio = () => {
  if (unlockAudio()) bgm.start();
};
window.addEventListener('pointerdown', startAudio);
window.addEventListener('keydown', startAudio);

// 公開用ビルドでは、オフラインでも遊べるようにサービスワーカーを登録する（開発中は登録しない）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 登録できなくても遊べる */
    });
  });
}

// デバッグ時はブラウザのコンソールから game を触れるようにする
if (DEBUG) (window as unknown as { __game: Phaser.Game }).__game = game;
