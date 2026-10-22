/**
 * ============================================================
 *  画面下部のトラップ一覧
 * ============================================================
 * カードの操作:
 *   - タップ         … そのトラップを選ぶ（選んだまま塔の穴をタップすると、続けて設置できる）。
 *                      選んでいるカードをもう一度タップすると選ぶのをやめる（GameScene 側で処理）
 *   - 左右へドラッグ … 一覧をスクロール（カードが画面に収まらないとき）
 *
 * 技術封印中のカードには「封印」、天才で強化したカードには ★レベル を表示する。
 */
import Phaser from 'phaser';
import { CAMERA, DEPTH } from '../config/visual';
import { CATEGORY_COLOR, TRAPS, type TrapDef } from '../config/traps';
import type { World } from '../sim/World';
import { num, t, textVersion, tn } from '../i18n/strings';
import { UI } from './theme';
import { makeText } from './widgets';

/** カードの大きさと間隔 */
const CARD_W = 128;
const CARD_H = 140;
const CARD_GAP = 12;
/** 選んでいるカードを持ち上げる量（px） */
const SELECTED_LIFT = 10;

interface Card {
  def: TrapDef;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
  lockText: Phaser.GameObjects.Text;
  levelText: Phaser.GameObjects.Text;
  state: string;
}

export class TrapBar {
  private readonly container: Phaser.GameObjects.Container;
  private readonly cards: Card[] = [];
  private scroll = 0;
  private readonly maxScroll: number;
  private pending: { def: TrapDef; startX: number; startScroll: number; scrolling: boolean } | null = null;
  /** 選んでいるトラップ（枠を光らせる） */
  private selectedId: string | null = null;
  /** 天才をドラッグ中に、ドロップ先として光らせるカード */
  private highlightId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    y: number,
    width: number,
    private readonly onSelect: (def: TrapDef) => void,
  ) {
    this.container = scene.add.container(x, y).setDepth(DEPTH.HUD + 1);
    const pad = 20;
    TRAPS.forEach((def, i) => {
      const cx = pad + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const c = scene.add.container(cx, CARD_H / 2);
      const bg = scene.add.rectangle(0, 0, CARD_W, CARD_H, UI.CARD).setStrokeStyle(2, UI.PANEL_EDGE);
      const band = scene.add.rectangle(0, -CARD_H / 2 + 5, CARD_W - 4, 8, CATEGORY_COLOR[def.category]);
      const icon = scene.add.image(0, -18, `trap_${def.id}`).setScale(0.95);
      const name = makeText(scene, 0, 26, def.name, 19).setOrigin(0.5);
      const levelText = makeText(scene, CARD_W / 2 - 6, -CARD_H / 2 + 12, '', 18, UI.TEXT_GOLD, { fontStyle: 'bold' }).setOrigin(1, 0);
      const costText = makeText(scene, 0, 52, `◆${def.cost}`, 20, UI.TEXT_GOLD).setOrigin(0.5);
      const lockText = makeText(scene, 0, -18, '', 20, UI.TEXT, { backgroundColor: '#000000aa', padding: { x: 4, y: 2 } }).setOrigin(0.5);
      c.add([bg, band, icon, name, costText, lockText, levelText]);
      this.container.add(c);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.pending = { def, startX: p.x, startScroll: this.scroll, scrolling: false };
      });
      this.cards.push({ def, container: c, bg, icon, nameText: name, costText, lockText, levelText, state: '' });
    });

    const contentW = pad * 2 + TRAPS.length * CARD_W + (TRAPS.length - 1) * CARD_GAP;
    this.maxScroll = Math.max(0, contentW - width);

    // 一覧の外にはみ出したカードを隠すマスク
    const maskShape = scene.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(x, y - 10, width, CARD_H + 20);
    this.container.setMask(maskShape.createGeometryMask());
  }

  /** 毎フレーム呼ぶ。発明済みか・買えるかで見た目を変える */
  refresh(world: World): void {
    for (const card of this.cards) {
      const def = card.def;
      const unlocked = world.isUnlocked(def);
      const sealed = unlocked && world.isSealed(def);
      const affordable = world.points >= def.cost;
      const kind = !unlocked ? 'locked' : sealed ? 'sealed' : affordable ? 'ok' : 'poor';
      const level = world.trapLevel[def.id] ?? 0;
      const cost = num(def.cost, 100 + def.cost);
      const lit = this.highlightId === def.id;
      const selected = this.selectedId === def.id;
      const state = `${kind}|${level}|${textVersion()}|${cost}|${lit}|${selected}`;
      if (state === card.state) continue;
      card.state = state;
      card.bg.setFillStyle(selected ? UI.CARD_SELECTED : unlocked && !sealed ? UI.CARD : UI.CARD_LOCKED);
      card.bg.setStrokeStyle(lit || selected ? 4 : 2, lit ? 0x7dff8a : selected ? 0xffd36b : UI.PANEL_EDGE);
      card.container.y = CARD_H / 2 - (selected ? SELECTED_LIFT : 0);
      card.icon.setAlpha(kind === 'ok' ? 1 : kind === 'poor' ? 0.5 : 0.15);
      card.nameText.setText(tn(def.name));
      card.costText.setText(`◆${cost}`);
      card.costText.setColor(kind === 'poor' ? UI.TEXT_DANGER : UI.TEXT_GOLD);
      card.lockText.setText(!unlocked ? t('lockedAt', { n: def.unlockFloor }) : sealed ? t('sealedTag') : '');
      card.lockText.setColor(sealed ? UI.TEXT_DANGER : UI.TEXT);
      card.lockText.setVisible(!unlocked || sealed);
      card.levelText.setText(level > 0 ? `★${level}` : '');
    }
  }

  /** 選んでいるトラップを設定する（null で解除） */
  setSelected(defId: string | null): void {
    this.selectedId = defId;
  }

  /** 天才をドラッグ中に、ドロップ先のカードを強調する */
  setHighlight(defId: string | null): void {
    this.highlightId = defId;
  }

  /** 画面座標にあるカードのトラップ（天才のドロップ先の判定用） */
  hitCard(px: number, py: number): TrapDef | null {
    for (const card of this.cards) {
      if (card.bg.getBounds().contains(px, py)) return card.def;
    }
    return null;
  }

  /** ポインタ移動。一覧の操作として処理したら true（＝塔の操作には使わない） */
  handleMove(p: Phaser.Input.Pointer): boolean {
    const pd = this.pending;
    if (!pd || !p.isDown) return false;
    const dx = p.x - pd.startX;
    if (!pd.scrolling && Math.abs(dx) > CAMERA.DRAG_THRESHOLD) pd.scrolling = true;
    if (pd.scrolling) {
      this.scroll = Phaser.Math.Clamp(pd.startScroll - dx, 0, this.maxScroll);
      this.container.x = this.x - this.scroll;
    }
    return true;
  }

  /** ポインタを離した。スクロールせずに離したらカードを選んだことにする */
  handleUp(): void {
    if (this.pending && !this.pending.scrolling) this.onSelect(this.pending.def);
    this.pending = null;
  }
}
