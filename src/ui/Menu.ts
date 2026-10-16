/**
 * 一時停止メニュー（再開・音量・ロード・最初から）
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/visual';
import type { Settings } from '../settings';
import { t } from '../i18n/strings';
import { UI } from './theme';
import { makeButton, makeText } from './widgets';

export interface MenuHandlers {
  onResume(): void;
  onRestart(): void;
  onLoad(): void;
  onSettingsChanged(s: Settings): void;
}

/** 音量を1回押したときに変わる量 */
const VOLUME_STEP = 0.1;

export class Menu {
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, w: number, h: number, settings: Settings, handlers: MenuHandlers) {
    const c = scene.add.container(0, 0).setDepth(DEPTH.MENU).setVisible(false);
    this.container = c;
    const blocker = scene.add.rectangle(0, 0, w, h, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
    const panelW = 520;
    const panelH = 660;
    const cx = w / 2;
    const cy = h / 2;
    const panel = scene.add.rectangle(cx, cy, panelW, panelH, UI.PANEL).setStrokeStyle(3, UI.PANEL_EDGE);
    const title = makeText(scene, cx, cy - panelH / 2 + 50, t('paused'), 40, UI.TEXT_GOLD, { fontStyle: 'bold' }).setOrigin(0.5);
    c.add([blocker, panel, title]);

    const resume = makeButton(scene, cx, cy - 170, 380, 80, t('resume'), handlers.onResume, { fontSize: 32 });
    c.add(resume.container);

    // 音量の行: ラベル [−] 70% [+]
    const volumeRow = (y: number, label: string, key: 'bgmVolume' | 'seVolume') => {
      const lbl = makeText(scene, cx - 200, y, label, 26).setOrigin(0, 0.5);
      const value = makeText(scene, cx + 95, y, '', 26, UI.TEXT_GOLD).setOrigin(0.5);
      const refresh = () => value.setText(`${Math.round(settings[key] * 100)}%`);
      const change = (d: number) => {
        settings[key] = Math.round(Phaser.Math.Clamp(settings[key] + d, 0, 1) * 10) / 10;
        refresh();
        handlers.onSettingsChanged(settings);
      };
      const minus = makeButton(scene, cx + 10, y, 64, 56, '−', () => change(-VOLUME_STEP), { fontSize: 30 });
      const plus = makeButton(scene, cx + 180, y, 64, 56, '+', () => change(VOLUME_STEP), { fontSize: 30 });
      refresh();
      c.add([lbl, value, minus.container, plus.container]);
    };
    volumeRow(cy - 60, t('bgm'), 'bgmVolume');
    volumeRow(cy + 20, t('se'), 'seVolume');

    const load = makeButton(scene, cx, cy + 130, 380, 72, t('load'), handlers.onLoad, { fontSize: 28 });
    c.add(load.container);

    const restart = makeButton(scene, cx, cy + 225, 380, 72, t('restart'), handlers.onRestart, { fontSize: 28, fill: 0x5a2d3e });
    c.add(restart.container);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  open(): void {
    this.container.setVisible(true);
  }

  close(): void {
    this.container.setVisible(false);
  }
}
