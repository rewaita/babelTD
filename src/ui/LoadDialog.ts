/**
 * ============================================================
 *  ロード画面
 * ============================================================
 * セーブ（10階ごと）の一覧を出し、2種類のロードを選べる。
 *   続きから     … セーブした時点をそのまま復元
 *   設備リセット … トラップを全部ポイントに戻し、敵が満ちた塔で建て直す
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/visual';
import { SAVE } from '../config/balance';
import { TRAP_BY_ID } from '../config/traps';
import type { SaveEntry } from '../saves';
import { t } from '../i18n/strings';
import { UI } from './theme';
import { makeButton, makeText } from './widgets';

export type LoadMode = 'normal' | 'reset';

/** 一度に表示するセーブの最大数（新しい階から） */
const MAX_ROWS = 8;
const ROW_H = 104;

/** 設備リセットで手に入るポイント（今のポイント＋トラップの払い戻し） */
export function resetPoints(entry: SaveEntry): number {
  let refund = 0;
  for (const slot of entry.data.slots) for (const tr of slot.traps) refund += TRAP_BY_ID[tr.defId]?.cost ?? 0;
  return Math.floor(entry.data.points + refund * SAVE.RESET_REFUND_RATIO);
}

export class LoadDialog {
  private container: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly w: number,
    private readonly h: number,
  ) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(saves: SaveEntry[], onChoose: (entry: SaveEntry, mode: LoadMode) => void): void {
    this.close();
    const scene = this.scene;
    const c = scene.add.container(0, 0).setDepth(DEPTH.MENU + 10);
    this.container = c;
    const cx = this.w / 2;

    const blocker = scene.add.rectangle(0, 0, this.w, this.h, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
    const rows = saves.slice(-MAX_ROWS).reverse();
    const panelW = 660;
    const panelH = 230 + Math.max(1, rows.length) * ROW_H;
    const top = this.h / 2 - panelH / 2;
    const panel = scene.add.rectangle(cx, this.h / 2, panelW, panelH, UI.PANEL).setStrokeStyle(3, UI.PANEL_EDGE);
    const title = makeText(scene, cx, top + 44, t('loadTitle'), 36, UI.TEXT_GOLD, { fontStyle: 'bold' }).setOrigin(0.5);
    const help = makeText(scene, cx, top + 112, t('loadHelp'), 18, UI.TEXT_SUB, { align: 'center', wordWrap: { width: panelW - 60 } }).setOrigin(0.5);
    const close = makeButton(scene, cx + panelW / 2 - 40, top + 40, 56, 50, '×', () => this.close(), { fontSize: 30 });
    c.add([blocker, panel, title, help, close.container]);

    if (rows.length === 0) {
      c.add(makeText(scene, cx, top + 200, t('loadNone'), 24, UI.TEXT_SUB).setOrigin(0.5));
      return;
    }

    rows.forEach((entry, i) => {
      const y = top + 190 + i * ROW_H + ROW_H / 2;
      const rowBg = scene.add.rectangle(cx, y, panelW - 40, ROW_H - 12, 0x241a3d).setStrokeStyle(1, UI.PANEL_EDGE);
      const floor = makeText(scene, cx - panelW / 2 + 40, y - 14, `${entry.floor}F`, 40, UI.TEXT_GOLD, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      const date = new Date(entry.savedAt);
      const when = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const sub = makeText(scene, cx - panelW / 2 + 40, y + 24, when, 16, UI.TEXT_SUB).setOrigin(0, 0.5);
      const normal = makeButton(scene, cx + 40, y, 170, 70, t('loadNormal'), () => {
        this.close();
        onChoose(entry, 'normal');
      }, { fontSize: 22 });
      const reset = makeButton(scene, cx + 220, y, 170, 70, `${t('loadReset')}\n◆${resetPoints(entry)}`, () => {
        this.close();
        onChoose(entry, 'reset');
      }, { fontSize: 18, fill: 0x5a2d3e });
      reset.label.setAlign('center');
      c.add([rowBg, floor, sub, normal.container, reset.container]);
    });
  }

  close(): void {
    this.container?.destroy();
    this.container = null;
  }
}
