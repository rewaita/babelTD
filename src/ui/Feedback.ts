/**
 * 画面上の短い通知
 *   Toast         … 画面中央付近に出るメッセージ（発明・作業員の死亡など）
 *   FloatingTexts … その場から浮かび上がって消える文字（+3 など）
 */
import Phaser from 'phaser';
import { ANIM, DEPTH, VIEW } from '../config/visual';
import { UI } from './theme';
import { makeText } from './widgets';

export class Toast {
  private readonly text: Phaser.GameObjects.Text;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    w: number,
  ) {
    this.text = makeText(scene, w / 2, VIEW.TOP_BAR_HEIGHT + 70, '', 26, UI.TEXT, {
      backgroundColor: '#140e26e6',
      padding: { x: 18, y: 10 },
      align: 'center',
      wordWrap: { width: w - 80 },
    })
      .setOrigin(0.5)
      .setDepth(DEPTH.TOAST)
      .setVisible(false);
  }

  /** ms = 0 なら hide() するまで出しっぱなし */
  show(message: string, ms: number = ANIM.TOAST_MS, color: string = UI.TEXT): void {
    this.timer?.remove();
    this.timer = null;
    this.scene.tweens.killTweensOf(this.text);
    this.text.setText(message).setColor(color).setAlpha(1).setVisible(true);
    if (ms > 0) {
      this.timer = this.scene.time.delayedCall(ms, () => {
        this.scene.tweens.add({ targets: this.text, alpha: 0, duration: 250, onComplete: () => this.text.setVisible(false) });
      });
    }
  }

  hide(): void {
    this.timer?.remove();
    this.timer = null;
    this.text.setVisible(false);
  }
}

export class FloatingTexts {
  constructor(private readonly scene: Phaser.Scene) {}

  spawn(x: number, y: number, message: string, color: string = UI.TEXT_GOLD, size = 24): void {
    const txt = makeText(this.scene, x, y, message, size, color, { stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(DEPTH.FLOAT_TEXT);
    this.scene.tweens.add({
      targets: txt,
      y: y - ANIM.FLOAT_TEXT_RISE,
      alpha: 0,
      duration: ANIM.FLOAT_TEXT_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }
}
