/**
 * ============================================================
 *  画面上部の「神の妨害」欄
 * ============================================================
 * 続いている妨害を小さな札（チップ）で並べる。
 *   - チップをタップ … その妨害の説明
 *   - 天才をチップへドラッグ … その妨害を解決（GameScene 側で処理）
 * 言語混乱中は、この欄の文字も乱れる。
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/visual';
import { TRAP_BY_ID } from '../config/traps';
import type { World } from '../sim/World';
import type { GodEffect } from '../sim/types';
import { t, textVersion, tn } from '../i18n/strings';
import { UI } from './theme';
import { makeText } from './widgets';

/** 一度に並べるチップの最大数（それ以上は「+N」） */
const MAX_CHIPS = 3;
/** 妨害の種類ごとのチップの色 */
const CHIP_COLOR: Record<GodEffect['kind'], number> = {
  language: 0x6a3fa0,
  numbers: 0x3f6aa0,
  strike: 0xa0563f,
  seal: 0x7a2f3f,
};

interface Chip {
  effect: GodEffect;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class GodPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly empty: Phaser.GameObjects.Text;
  private readonly more: Phaser.GameObjects.Text;
  private chips: Chip[] = [];
  private signature = '';
  private highlightId: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly w: number,
    private readonly h: number,
    private readonly onChipTap: (effect: GodEffect) => void,
  ) {
    this.container = scene.add.container(x, y).setDepth(DEPTH.HUD);
    const bg = scene.add.rectangle(0, 0, w, h, 0x241a3d).setStrokeStyle(2, UI.PANEL_EDGE).setInteractive();
    this.title = makeText(scene, 0, -h / 2 + 14, '', 18, UI.TEXT_SUB).setOrigin(0.5);
    this.empty = makeText(scene, 0, 12, '', 22, UI.TEXT_SUB).setOrigin(0.5);
    this.more = makeText(scene, w / 2 - 8, 12, '', 18, UI.TEXT).setOrigin(1, 0.5);
    this.container.add([bg, this.title, this.empty, this.more]);
  }

  /** 毎フレーム呼ぶ。妨害の並びや文字が変わったときだけ作り直す */
  update(world: World): void {
    const effects = world.godEffects;
    const sig =
      `${textVersion()}|${this.highlightId}|` +
      effects.map((g) => `${g.id}:${g.timeLeft === null ? '-' : Math.ceil(g.timeLeft)}`).join(',');
    if (sig === this.signature) return;
    this.signature = sig;

    this.title.setText(t('godTitle'));
    this.empty.setText(t('godNone')).setVisible(effects.length === 0);
    for (const c of this.chips) {
      c.bg.destroy();
      c.label.destroy();
    }
    this.chips = [];

    const shown = effects.slice(0, MAX_CHIPS);
    const gap = 6;
    const chipW = (this.w - 16 - gap * (MAX_CHIPS - 1)) / MAX_CHIPS;
    const chipH = this.h - 38;
    shown.forEach((effect, i) => {
      const cx = -this.w / 2 + 8 + chipW / 2 + i * (chipW + gap);
      const cy = 12;
      const lit = effect.id === this.highlightId;
      const bg = this.scene.add
        .rectangle(cx, cy, chipW, chipH, CHIP_COLOR[effect.kind])
        .setStrokeStyle(lit ? 4 : 1, lit ? 0x7dff8a : 0xffffff, lit ? 1 : 0.4)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.onChipTap(effect);
      });
      const label = makeText(this.scene, cx, cy, this.chipText(effect), 15, '#ffffff', { align: 'center' }).setOrigin(0.5);
      this.container.add([bg, label]);
      this.chips.push({ effect, bg, label });
    });
    const rest = effects.length - shown.length;
    this.more.setText(rest > 0 ? `+${rest}` : '');
  }

  private chipText(effect: GodEffect): string {
    if (effect.kind === 'seal') {
      const def = effect.trapId ? TRAP_BY_ID[effect.trapId] : undefined;
      return `${t('god_seal')}\n${def ? tn(def.name) : ''}`;
    }
    const time = effect.timeLeft === null ? '' : `\n${Math.ceil(effect.timeLeft)}s`;
    return `${t(`god_${effect.kind}`)}${time}`;
  }

  /** 画面座標にあるチップの妨害（天才のドロップ先の判定用） */
  hitChip(px: number, py: number): GodEffect | null {
    for (const c of this.chips) {
      const b = c.bg.getBounds();
      if (b.contains(px, py)) return c.effect;
    }
    return null;
  }

  /** 天才をドラッグ中に、ドロップ先のチップを強調する */
  setHighlight(id: number | null): void {
    this.highlightId = id;
  }
}
