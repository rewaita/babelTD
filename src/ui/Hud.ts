/**
 * ============================================================
 *  画面上部・下部のバーと、右側のボタン
 * ============================================================
 *   上部: 到達階数（スコア） / 神の妨害の欄（天才はここへドラッグ） / メニュー
 *   下部: ポイント残高 / 作業員の人数 / 天才ボタン / （トラップ一覧は TrapBar）
 *   右側: 俯瞰ボタン / 頂上へ戻るボタン
 *
 * 文字はすべて i18n（t / num）を通すので、言語混乱中は乱れて表示される。
 */
import Phaser from 'phaser';
import { DEPTH, VIEW } from '../config/visual';
import { WORKERS } from '../config/balance';
import type { World } from '../sim/World';
import type { GodEffect } from '../sim/types';
import { num, t } from '../i18n/strings';
import { GodPanel } from './GodPanel';
import { UI } from './theme';
import { makeButton, makeText, type Button } from './widgets';

export interface HudHandlers {
  onMenu(): void;
  onOverview(): void;
  onToTop(): void;
  /** 天才ボタンを押した（ドラッグの開始。GameScene 側で処理） */
  onGeniusDown(pointer: Phaser.Input.Pointer): void;
  /** 妨害欄のチップをタップした */
  onGodChip(effect: GodEffect): void;
}

export class Hud {
  readonly godPanel: GodPanel;
  private readonly reachedLabel: Phaser.GameObjects.Text;
  private readonly floorText: Phaser.GameObjects.Text;
  private readonly pointsText: Phaser.GameObjects.Text;
  private readonly incomeText: Phaser.GameObjects.Text;
  private readonly workersText: Phaser.GameObjects.Text;
  private readonly overviewBtn: Button;
  private readonly toTopBtn: Button;
  private readonly geniusBtn: Button;
  /** 前回表示した文字（変わったときだけ書き換えるため） */
  private last: Record<string, string> = {};

  constructor(scene: Phaser.Scene, w: number, h: number, handlers: HudHandlers) {
    const top = VIEW.TOP_BAR_HEIGHT;
    const bottomY = h - VIEW.BOTTOM_BAR_HEIGHT;

    // ---- 上部バー ----
    scene.add
      .rectangle(0, 0, w, top, UI.PANEL, UI.PANEL_ALPHA)
      .setOrigin(0, 0)
      .setDepth(DEPTH.HUD)
      .setInteractive(); // 下の塔にタップが抜けないように
    scene.add.rectangle(0, top, w, 2, UI.PANEL_EDGE).setOrigin(0, 0).setDepth(DEPTH.HUD);

    this.reachedLabel = makeText(scene, 24, 14, '', 20, UI.TEXT_SUB).setDepth(DEPTH.HUD);
    this.floorText = makeText(scene, 24, 38, '', 56, UI.TEXT_GOLD, { fontStyle: 'bold' }).setDepth(DEPTH.HUD);

    this.godPanel = new GodPanel(scene, w / 2 + 20, top / 2, 320, 96, handlers.onGodChip);

    makeButton(scene, w - 56, top / 2, 76, 76, '≡', handlers.onMenu, { fontSize: 40 }).container.setDepth(DEPTH.HUD);

    // ---- 下部バー ----
    scene.add
      .rectangle(0, bottomY, w, VIEW.BOTTOM_BAR_HEIGHT, UI.PANEL, UI.PANEL_ALPHA)
      .setOrigin(0, 0)
      .setDepth(DEPTH.HUD)
      .setInteractive();
    scene.add.rectangle(0, bottomY, w, 2, UI.PANEL_EDGE).setOrigin(0, 0).setDepth(DEPTH.HUD);

    this.pointsText = makeText(scene, 24, bottomY + 14, '', 36, UI.TEXT_GOLD, { fontStyle: 'bold' }).setDepth(DEPTH.HUD);
    this.incomeText = makeText(scene, 24, bottomY + 56, '', 18, UI.TEXT_SUB).setDepth(DEPTH.HUD);
    this.workersText = makeText(scene, w / 2 - 20, bottomY + 26, '', 24, UI.TEXT).setOrigin(0.5, 0).setDepth(DEPTH.HUD);

    // 天才ボタン: 押してドラッグすると天才を使える
    this.geniusBtn = makeButton(scene, w - 90, bottomY + 40, 150, 56, '', () => {}, { fontSize: 24, fill: 0x5a4a1e, edge: 0xffd36b });
    this.geniusBtn.container.setDepth(DEPTH.HUD);
    const icon = scene.add.image(-48, 0, 'genius').setScale(0.6);
    this.geniusBtn.container.add(icon);
    this.geniusBtn.label.setX(14);
    this.geniusBtn.bg.on('pointerdown', (p: Phaser.Input.Pointer) => handlers.onGeniusDown(p));

    // ---- 右側のボタン ----
    const midY = top + (bottomY - top) * 0.62;
    this.overviewBtn = makeButton(scene, w - 52, midY, 84, 84, '', handlers.onOverview, { fontSize: 26, fill: 0x2d2350 });
    this.overviewBtn.container.setDepth(DEPTH.HUD);
    this.toTopBtn = makeButton(scene, w - 52, midY + 100, 84, 64, '', handlers.onToTop, { fontSize: 18, fill: 0x2d2350 });
    this.toTopBtn.container.setDepth(DEPTH.HUD);
  }

  /** 文字が前回と違うときだけ書き換える */
  private set(key: string, text: Phaser.GameObjects.Text, value: string): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    text.setText(value);
  }

  /** 天才ボタンの画面上の範囲（天才がいないときの判定用） */
  geniusButtonBounds(): Phaser.Geom.Rectangle {
    return this.geniusBtn.bg.getBounds();
  }

  /** 毎フレーム呼ぶ */
  update(world: World, state: { overview: boolean; follow: boolean }): void {
    this.set('reached', this.reachedLabel, t('reached'));
    this.set('floor', this.floorText, `${world.floor}${t('floorUnit')}`);
    this.set('points', this.pointsText, `◆ ${num(Math.floor(world.points), 1)}`);
    this.set('income', this.incomeText, `+${num(Math.round(world.incomeRate() * 10) / 10, 2)}/s`);

    const n = world.workers.length;
    const workersLabel = world.workersStopped
      ? `${t('workersStopped')} ${n}/${WORKERS.MAX_COUNT}`
      : `${t('workers')} ${n}/${WORKERS.MAX_COUNT}${world.workerBuffTime > 0 ? ' ▲' : ''}`;
    this.set('workers', this.workersText, workersLabel);
    this.workersText.setColor(n <= 1 || world.workersStopped ? UI.TEXT_DANGER : world.workerBuffTime > 0 ? UI.TEXT_GOOD : UI.TEXT);

    this.geniusBtn.setLabel(`${t('geniusLabel')} ×${world.geniuses}`);
    this.geniusBtn.container.setAlpha(world.geniuses > 0 ? 1 : 0.45);
    this.overviewBtn.setLabel(state.overview ? t('overviewOff') : t('overview'));
    this.toTopBtn.setLabel(`▲${t('toTop')}`);
    this.toTopBtn.container.setVisible(!state.follow && !state.overview);
    this.godPanel.update(world);
  }
}
