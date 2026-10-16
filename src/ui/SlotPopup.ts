/**
 * 設置済みの穴をダブルタップしたときに出る小窓（撤去・移動）
 * 外側をタップすると閉じる。
 */
import Phaser from 'phaser';
import { DEPTH, VIEW } from '../config/visual';
import type { TrapDef } from '../config/traps';
import type { Slot } from '../sim/types';
import type { HoleInfo } from '../render/TowerRenderer';
import { num, t, tn } from '../i18n/strings';
import { UI } from './theme';
import { makeButton, makeText } from './widgets';

export class SlotPopup {
  private container: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly w: number,
    private readonly h: number,
  ) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(
    hole: HoleInfo,
    slot: Slot,
    removeCost: (def: TrapDef) => number,
    onRemove: (index: number) => void,
    onMove: (index: number) => void,
  ): void {
    this.close();
    const scene = this.scene;
    const c = scene.add.container(0, 0).setDepth(DEPTH.POPUP);
    this.container = c;

    // 外側タップで閉じるための透明な板
    const blocker = scene.add.rectangle(0, 0, this.w, this.h, 0x000000, 0.25).setOrigin(0, 0).setInteractive();
    blocker.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.close();
    });
    c.add(blocker);

    const synergies = slot.effect.synergies;
    const rowH = 84;
    const panelW = 560;
    const panelH = 76 + slot.traps.length * rowH + synergies.length * 34;
    const px = Phaser.Math.Clamp(hole.x, panelW / 2 + 10, this.w - panelW / 2 - 10);
    const py = Phaser.Math.Clamp(
      hole.y - panelH / 2 - 60,
      VIEW.TOP_BAR_HEIGHT + panelH / 2 + 10,
      this.h - VIEW.BOTTOM_BAR_HEIGHT - panelH / 2 - 10,
    );
    const panel = scene.add.rectangle(px, py, panelW, panelH, UI.PANEL).setStrokeStyle(3, UI.PANEL_EDGE).setInteractive();
    const top = py - panelH / 2;
    const title = makeText(scene, px - panelW / 2 + 20, top + 18, t('slotTitle'), 22, UI.TEXT_SUB);
    const close = makeButton(scene, px + panelW / 2 - 36, top + 32, 52, 44, '×', () => this.close(), { fontSize: 28 });
    c.add([panel, title, close.container]);

    let y = top + 70;
    for (const syn of synergies) {
      c.add(makeText(scene, px - panelW / 2 + 20, y, t(`synergy_${syn}`), 20, UI.TEXT_GOOD));
      y += 34;
    }
    slot.traps.forEach((trap, i) => {
      const rowY = y + rowH / 2 + i * rowH - 6;
      const icon = scene.add.image(px - panelW / 2 + 50, rowY, `trap_${trap.def.id}`).setScale(0.8);
      if (trap.disabled) icon.setTint(0x4a4a55);
      const nameLabel = trap.disabled ? `${tn(trap.def.name)}\n${t('disabledTag')}` : tn(trap.def.name);
      const name = makeText(scene, px - panelW / 2 + 92, rowY, nameLabel, 22, trap.disabled ? UI.TEXT_DANGER : UI.TEXT).setOrigin(0, 0.5);
      const cost = num(removeCost(trap.def), 200 + i);
      const rm = makeButton(scene, px + 90, rowY, 110, 58, `${t('remove')}\n◆${cost}`, () => {
        this.close();
        onRemove(i);
      }, { fontSize: 18, fill: 0x5a2d3e });
      rm.label.setAlign('center');
      c.add([icon, name, rm.container]);
      // 雷で停止したトラップは移動できない（撤去のみ）
      if (!trap.disabled) {
        const mv = makeButton(scene, px + 210, rowY, 110, 58, `${t('move')}\n◆${cost}`, () => {
          this.close();
          onMove(i);
        }, { fontSize: 18 });
        mv.label.setAlign('center');
        c.add(mv.container);
      }
    });
  }

  close(): void {
    this.container?.destroy();
    this.container = null;
  }
}
