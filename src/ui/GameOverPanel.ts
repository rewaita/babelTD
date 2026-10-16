/**
 * ゲームオーバー画面（到達階数・最高記録・もう一度・ロード）
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/visual';
import { t } from '../i18n/strings';
import { UI } from './theme';
import { makeButton, makeText } from './widgets';

export class GameOverPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly floorText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, w: number, h: number, onRetry: () => void, onLoad: () => void) {
    const c = scene.add.container(0, 0).setDepth(DEPTH.MENU).setVisible(false);
    this.container = c;
    const cx = w / 2;
    const cy = h / 2;
    const blocker = scene.add.rectangle(0, 0, w, h, 0x05010a, 0.75).setOrigin(0, 0).setInteractive();
    const title = makeText(scene, cx, cy - 200, t('gameOverTitle'), 40, UI.TEXT_DANGER, { fontStyle: 'bold' }).setOrigin(0.5);
    const label = makeText(scene, cx, cy - 100, t('reachedFloor'), 26, UI.TEXT_SUB).setOrigin(0.5);
    this.floorText = makeText(scene, cx, cy - 30, '', 96, UI.TEXT_GOLD, { fontStyle: 'bold' }).setOrigin(0.5);
    this.bestText = makeText(scene, cx, cy + 60, '', 26, UI.TEXT).setOrigin(0.5);
    const retry = makeButton(scene, cx, cy + 160, 360, 84, t('retry'), onRetry, { fontSize: 32 });
    const load = makeButton(scene, cx, cy + 260, 360, 72, t('load'), onLoad, { fontSize: 28 });
    c.add([blocker, title, label, this.floorText, this.bestText, retry.container, load.container]);
  }

  show(floor: number, best: number, isNewRecord: boolean): void {
    this.floorText.setText(`${floor}${t('floorUnit')}`);
    this.bestText.setText(isNewRecord ? t('newRecord') : `${t('best')} ${best}${t('floorUnit')}`);
    this.bestText.setColor(isNewRecord ? UI.TEXT_GOOD : UI.TEXT);
    this.container.setVisible(true).setAlpha(0);
    this.container.scene.tweens.add({ targets: this.container, alpha: 1, duration: 600 });
  }
}
