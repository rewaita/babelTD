/**
 * ============================================================
 *  トラップ・敵・作業員の描画
 * ============================================================
 * シミュレーション（World）の状態を見て、画像（スプライト）を並べます。
 * 画面に映っているものだけスプライトを作り、見えなくなったら消します。
 */
import Phaser from 'phaser';
import { ANIM, DEPTH, TOWER_LOOK } from '../config/visual';
import { WORKERS } from '../config/balance';
import type { World } from '../sim/World';
import type { SlotId } from '../sim/types';
import type { HoleInfo } from './TowerRenderer';
import type { Projected, TowerView } from './TowerView';
import { FONT } from '../ui/theme';
import { num, t } from '../i18n/strings';

/** 穴の強調表示の種類 */
export type HighlightMode = 'ok' | 'ng' | 'source';

const P: Projected = { x: 0, y: 0, z: 0, k: 1 };

const HIGHLIGHT_COLOR: Record<HighlightMode, number> = {
  ok: 0x7dff8a,
  ng: 0xff5a5a,
  source: 0xffd23f,
};

export class EntityRenderer {
  /** 強調表示する穴（ドラッグ中の吸い付き先など） */
  highlight: { id: SlotId; mode: HighlightMode } | null = null;
  /** 天才をドラッグ中に、作業員をドロップ先として強調するか */
  workersHighlight = false;
  /** 作業員の集団の画面上の中心（タップ判定用）。見えていなければ null */
  workersCenter: { x: number; y: number } | null = null;

  private readonly enemySprites = new Map<number, Phaser.GameObjects.Image>();
  /** 敵ごとの前フレームの位置（押し戻し・落下の演出用） */
  private readonly enemyTracks = new Map<
    number,
    { s: number; x: number; y: number; anim?: { fromX: number; fromY: number; start: number } }
  >();
  private readonly trapSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly workerSprites: Phaser.GameObjects.Image[] = [];
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly addLabel: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: TowerView,
  ) {
    this.overlay = scene.add.graphics().setDepth(DEPTH.OVERLAY);
    for (let i = 0; i < WORKERS.MAX_COUNT; i++) {
      this.workerSprites.push(scene.add.image(0, 0, 'worker').setOrigin(0.5, 1).setDepth(DEPTH.WORKERS).setVisible(false));
    }
    this.addLabel = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: '#fff4d6', backgroundColor: '#3b2d5ecc', padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.WORKERS)
      .setResolution(2);
  }

  draw(world: World, holes: readonly HoleInfo[], time: number): void {
    this.overlay.clear();
    this.drawTraps(world, holes);
    this.drawEnemies(world, time);
    this.drawWorkers(world, time);
    this.drawHighlight(holes);
  }

  // ------------------------------------------------------------

  private drawTraps(world: World, holes: readonly HoleInfo[]): void {
    const used = new Set<string>();
    for (const hole of holes) {
      const slot = world.getSlot(hole.id);
      if (!slot) continue;
      const n = slot.traps.length;
      const active = slot.activeUntil > world.time;
      slot.traps.forEach((trap, i) => {
        const key = `${hole.id}:${trap.uid}`;
        used.add(key);
        let sp = this.trapSprites.get(key);
        if (!sp) {
          sp = this.scene.add.image(0, 0, `trap_${trap.def.id}`).setDepth(DEPTH.TRAPS);
          this.trapSprites.set(key, sp);
        }
        const offset = n === 2 ? (i === 0 ? -1 : 1) * hole.w * 0.24 : 0;
        const base = ANIM.TRAP_ICON_SCALE * this.view.zoom * hole.k * (n === 2 ? 0.72 : 1) * (active ? ANIM.TRAP_ACTIVE_PULSE : 1);
        sp.setPosition(hole.x + offset, hole.y);
        sp.setScale(base * Math.max(0.3, hole.z), base);
        if (trap.disabled) {
          // 雷で停止中: 暗くして、稲妻の印を重ねる
          sp.setTint(0x4a4a55).setAlpha(0.9);
          this.drawBoltMark(hole.x + offset, hole.y, base * 40);
        } else {
          sp.clearTint().setAlpha(active ? 1 : 0.92);
        }
      });
    }
    for (const [key, sp] of this.trapSprites) {
      if (!used.has(key)) {
        sp.destroy();
        this.trapSprites.delete(key);
      }
    }
  }

  private drawEnemies(world: World, time: number): void {
    const v = this.view;
    const [hMin, hMax] = v.visibleHeights();
    const base = world.hordeTop;
    const lane = TOWER_LOOK.RAMP_WIDTH * TOWER_LOOK.ENEMY_LANE;
    const used = new Set<number>();
    const g = this.overlay;

    for (const e of world.enemies) {
      if (e.s < Math.max(0, base) || e.s < hMin - 0.5 || e.s > hMax + 0.5) continue;
      const p = v.project(e.s, 0, lane, P);
      if (p.z < 0.05) continue; // 塔の裏側は見えない
      used.add(e.uid);
      let sp = this.enemySprites.get(e.uid);
      if (!sp) {
        sp = this.scene.add.image(0, 0, `enemy_${e.def.id}`).setOrigin(0.5, 0.92);
        this.enemySprites.set(e.uid, sp);
      }
      const zk = v.zoom * p.k;

      // 歩行の揺れ（跳ね型は大きく跳ねる）
      const moving = !e.attacking;
      const bobH = e.def.jump ? ANIM.JUMPER_BOB_HEIGHT : ANIM.ENEMY_BOB_HEIGHT;
      const bobSpeed = e.def.jump ? ANIM.JUMPER_BOB_SPEED : ANIM.ENEMY_BOB_SPEED;
      const bob = moving ? Math.abs(Math.sin(time * bobSpeed + e.uid)) * bobH * zk : 0;

      // 押し戻し・落下されたら、元の位置から放物線を描いて移動する演出
      let x = p.x;
      let y = p.y - bob;
      const track = this.enemyTracks.get(e.uid);
      if (track && track.s - e.s > 0.05) {
        track.anim = { fromX: track.x, fromY: track.y, start: time };
      }
      const anim = track?.anim;
      if (anim) {
        const t = (time - anim.start) / (ANIM.FORCE_ANIM_MS / 1000);
        if (t >= 1 || t < 0) {
          track!.anim = undefined;
        } else {
          const ease = 1 - (1 - t) * (1 - t);
          x = anim.fromX + (x - anim.fromX) * ease;
          y = anim.fromY + (y - anim.fromY) * ease - Math.sin(Math.PI * t) * ANIM.FORCE_ANIM_ARC * zk;
        }
      }
      this.enemyTracks.set(e.uid, { s: e.s, x, y, anim: track?.anim });

      const scale = zk * (0.8 + 0.2 * p.z) * ANIM.ENEMY_SCALE;
      sp.setPosition(x, y);
      sp.setScale(scale);
      sp.setDepth(DEPTH.ENEMIES + p.z * 0.5);
      // 色: ダメージ中 > 減速 > 毒 > 脆化
      if (e.hurt && !e.statuses.poison) sp.setTint(0xff9a9a);
      else if (e.currentSlow > 0.05) sp.setTint(0x9ad0ff);
      else if (e.statuses.poison) sp.setTint(0xb8f07a);
      else if (e.statuses.weaken) sp.setTint(0xe8b0ff);
      else sp.clearTint();

      // 体力バー（減っているときだけ）と、かかっている状態の小さな印
      const bw = e.def.size * scale;
      const by = y - e.def.size * scale - 10 * zk;
      const bh = Math.max(2, 5 * v.zoom);
      if (e.hp < e.maxHp) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x - bw / 2, by, bw, bh);
        g.fillStyle(0xff5a5a, 1);
        g.fillRect(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), bh);
      }
      let dotX = x - bw / 2 + 4 * zk;
      const dotR = Math.max(2, 4 * zk);
      for (const [on, color] of [
        [!!e.statuses.poison, 0x8ee04a],
        [!!e.statuses.weaken, 0xd27aff],
        [e.currentSlow > 0.05, 0x6ab8ff],
      ] as const) {
        if (!on) continue;
        g.fillStyle(color, 1);
        g.fillCircle(dotX, by - dotR - 2, dotR);
        dotX += dotR * 2.5;
      }
    }
    for (const [uid, sp] of this.enemySprites) {
      if (!used.has(uid)) {
        sp.destroy();
        this.enemySprites.delete(uid);
        this.enemyTracks.delete(uid);
      }
    }
  }

  private drawWorkers(world: World, time: number): void {
    const v = this.view;
    const n = world.workers.length;
    const RW = TOWER_LOOK.RAMP_WIDTH;
    this.workersCenter = null;
    for (let i = 0; i < this.workerSprites.length; i++) {
      const sp = this.workerSprites[i];
      if (i >= n) {
        sp.setVisible(false);
        continue;
      }
      // 7人ずつ横に並べ、列を坂道の外側へずらす
      const col = i % 7;
      const row = Math.floor(i / 7);
      const p = v.project(world.workerS + col * 0.008, 0, RW * (0.2 + row * 0.3), P);
      if (p.z < 0.05) {
        sp.setVisible(false);
        continue;
      }
      // 作業停止中は手が止まる。天才の指揮中は速く動く
      const speed = world.workerBuffTime > 0 ? ANIM.WORKER_HAMMER_SPEED * 2 : ANIM.WORKER_HAMMER_SPEED;
      const hammer = world.workersStopped ? 0 : Math.abs(Math.sin(time * speed + i * 1.3)) * 4 * v.zoom * p.k;
      sp.setVisible(true);
      sp.setPosition(p.x, p.y - hammer);
      sp.setScale(v.zoom * p.k * ANIM.WORKER_SCALE * (0.85 + 0.15 * p.z));
      sp.setDepth(DEPTH.WORKERS + row * 0.01);
      // 先頭の人（攻撃を受ける人）は体力に応じて赤くなる
      if (i === 0 && world.workers[0] < WORKERS.HP) {
        sp.setTint(Phaser.Display.Color.GetColor(255, Math.round(120 + 135 * (world.workers[0] / WORKERS.HP)), 120));
      } else if (world.workersStopped) sp.setTint(0x8a8aa0);
      else if (world.workerBuffTime > 0) sp.setTint(0xfff0a0);
      else sp.clearTint();
    }

    const center = v.project(world.workerS + 0.024, 0, RW * 0.4, P);
    if (n > 0 && center.z > 0.1) this.workersCenter = { x: center.x, y: center.y - 20 * v.zoom * center.k };
    if (this.workersHighlight && this.workersCenter) {
      this.overlay.lineStyle(5, 0x7dff8a, 1);
      this.overlay.strokeCircle(this.workersCenter.x, this.workersCenter.y, 60 * Math.max(0.6, v.zoom * center.k));
    }

    // 「＋作業員」ラベル（作業員の上）
    const label = v.project(world.workerS + 0.024, 1.0, 0, P);
    const canAdd = n > 0 && n < WORKERS.MAX_COUNT && !world.gameOver;
    if (canAdd && label.z > 0.1) {
      const cost = world.addWorkerCost();
      const text = `${t('addWorker')}  ◆${num(cost, 3)}`;
      if (this.addLabel.text !== text) this.addLabel.setText(text);
      this.addLabel.setPosition(label.x, label.y);
      this.addLabel.setScale(Math.max(0.6, v.zoom * label.k));
      this.addLabel.setAlpha(world.points >= cost ? 1 : 0.5);
      this.addLabel.setVisible(true);
    } else {
      this.addLabel.setVisible(false);
    }
  }

  private drawHighlight(holes: readonly HoleInfo[]): void {
    if (!this.highlight) return;
    const hole = holes.find((h) => h.id === this.highlight!.id);
    if (!hole) return;
    const g = this.overlay;
    const pad = 8 * this.view.zoom * hole.k;
    g.lineStyle(Math.max(2, 5 * this.view.zoom * hole.k), HIGHLIGHT_COLOR[this.highlight.mode], 1);
    g.strokeRoundedRect(hole.x - hole.w / 2 - pad, hole.y - hole.h / 2 - pad, hole.w + pad * 2, hole.h + pad * 2, 8);
  }

  /** 停止中のトラップに重ねる稲妻の印 */
  private drawBoltMark(x: number, y: number, size: number): void {
    const g = this.overlay;
    const s = size / 2;
    g.fillStyle(0xffe14a, 1);
    g.fillTriangle(x + s * 0.2, y - s, x - s * 0.5, y + s * 0.1, x + s * 0.05, y + s * 0.1);
    g.fillTriangle(x - s * 0.2, y + s, x + s * 0.5, y - s * 0.1, x - s * 0.05, y - s * 0.1);
  }

  // ------------------------------------------------------------

  /** 作業員（または＋作業員ラベル）をタップしたか */
  hitWorkers(x: number, y: number): boolean {
    if (this.addLabel.visible && this.addLabel.getBounds().contains(x, y)) return true;
    if (!this.workersCenter) return false;
    return Math.hypot(x - this.workersCenter.x, y - this.workersCenter.y) < 55 * Math.max(0.6, this.view.zoom);
  }
}
