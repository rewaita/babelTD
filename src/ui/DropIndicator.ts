/**
 * ============================================================
 *  空中投下の通知
 * ============================================================
 * 予告中（降ってくるまで）と、着地直後しばらくの間、場所を知らせる。
 *   - 降下地点が画面内 … その場所に赤い「！」マーカー（塔の裏側なら塔の横に出す）
 *   - 画面外           … 画面の上端/下端に吹き出し＋矢印（タップするとその場所へカメラが移動）
 */
import Phaser from 'phaser';
import { DEPTH, TOWER_LOOK, VIEW } from '../config/visual';
import type { World } from '../sim/World';
import type { PendingDrop } from '../sim/types';
import type { Projected, TowerView } from '../render/TowerView';
import { t } from '../i18n/strings';
import { makeText } from './widgets';

/** 着地後に通知を残す秒数 */
const LANDED_SHOW_SEC = 1.5;
/** 吹き出しの大きさ */
const BUBBLE_W = 210;
const BUBBLE_H = 64;
/** 色 */
const DANGER = 0xff4a5a;

const P: Projected = { x: 0, y: 0, z: 0, k: 1 };

interface Marker {
  drop: PendingDrop;
  /** 着地済みなら着地した時刻 */
  landedAt: number | null;
  label: Phaser.GameObjects.Text;
}

export class DropIndicator {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly markers = new Map<number, Marker>();
  /** タップ判定用（吹き出しの位置と、移動先の高さ） */
  private hitAreas: { x: number; y: number; w: number; h: number; s: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: TowerView,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.FLOAT_TEXT + 1);
  }

  /** 着地したことを知らせる（着地の波紋を出す） */
  onLanded(drop: PendingDrop, time: number): void {
    const m = this.markers.get(drop.id);
    if (m) m.landedAt = time;
  }

  draw(world: World, time: number): void {
    const v = this.view;
    const g = this.g;
    g.clear();
    this.hitAreas = [];

    // 予告中の投下を登録
    for (const drop of world.pendingDrops) {
      if (!this.markers.has(drop.id)) {
        const label = makeText(this.scene, 0, 0, '', 22, '#ffffff', { fontStyle: 'bold', align: 'center' })
          .setOrigin(0.5)
          .setDepth(DEPTH.FLOAT_TEXT + 2);
        this.markers.set(drop.id, { drop, landedAt: null, label });
      }
    }

    const areaTop = VIEW.TOP_BAR_HEIGHT;
    const areaBottom = v.height - VIEW.BOTTOM_BAR_HEIGHT;
    const lane = TOWER_LOOK.RAMP_WIDTH * TOWER_LOOK.ENEMY_LANE;
    const pulse = 0.5 + 0.5 * Math.sin(time * 10);

    for (const [id, m] of this.markers) {
      const landed = m.landedAt !== null;
      if (landed && time - m.landedAt! > LANDED_SHOW_SEC) {
        m.label.destroy();
        this.markers.delete(id);
        continue;
      }
      const drop = m.drop;
      const floorLabel = `${Math.floor(drop.s) + 1}F`;
      const p = v.project(drop.s, 0.2, lane, P);
      const zk = v.zoom * p.k;

      if (p.y > areaTop + 50 && p.y < areaBottom - 30 && drop.s >= world.hordeTop) {
        // ---- 画面内: その場所にマーカー ----
        let x = p.x;
        if (p.z <= 0.05) {
          // 塔の裏側: 塔の横に出す
          const edge = v.radiusAt(drop.s) + 46 * zk;
          x = p.x >= v.cx ? v.cx + edge : v.cx - edge;
        }
        x = Phaser.Math.Clamp(x, 36, v.width - 36);
        if (!landed) {
          // 落ちてくる柱（危険範囲）
          g.fillStyle(DANGER, 0.12 + 0.08 * pulse);
          g.fillRect(x - 18 * zk, areaTop, 36 * zk, p.y - areaTop);
          g.lineStyle(4, DANGER, 0.7 + 0.3 * pulse);
          g.strokeCircle(x, p.y, (24 + 6 * pulse) * Math.max(0.6, zk));
          m.label.setText(`！\n${drop.timeLeft.toFixed(1)}`).setPosition(x, p.y - 4).setScale(Math.max(0.7, zk)).setVisible(true);
        } else {
          // 着地の波紋
          const t01 = (time - m.landedAt!) / LANDED_SHOW_SEC;
          g.lineStyle(5 * (1 - t01) + 1, DANGER, 1 - t01);
          g.strokeEllipse(x, p.y, (40 + 160 * t01) * zk, (14 + 50 * t01) * zk);
          m.label.setVisible(false);
        }
      } else {
        // ---- 画面外: 上端か下端に吹き出し＋矢印 ----
        const above = p.y <= areaTop + 50;
        const bx = Phaser.Math.Clamp(p.z > 0 ? p.x : v.cx, BUBBLE_W / 2 + 12, v.width - BUBBLE_W / 2 - 100);
        const by = above ? areaTop + 22 + BUBBLE_H / 2 + 14 : areaBottom - 22 - BUBBLE_H / 2 - 14;
        g.fillStyle(landed ? 0x6a2a34 : DANGER, landed ? 0.85 : 0.75 + 0.25 * pulse);
        g.fillRoundedRect(bx - BUBBLE_W / 2, by - BUBBLE_H / 2, BUBBLE_W, BUBBLE_H, 14);
        // 矢印（吹き出しの外側、地点の方向）
        const ay = above ? by - BUBBLE_H / 2 : by + BUBBLE_H / 2;
        const dir = above ? -1 : 1;
        g.fillTriangle(bx - 16, ay, bx + 16, ay, bx, ay + dir * 22);
        const title = drop.big ? t('dropWarningBig') : t('dropWarning');
        const status = landed ? '着地' : `${drop.timeLeft.toFixed(1)}秒`;
        m.label.setText(`${title}\n${floorLabel}  ${status}`).setPosition(bx, by).setScale(0.85).setVisible(true);
        this.hitAreas.push({ x: bx, y: by, w: BUBBLE_W, h: BUBBLE_H + 24, s: drop.s });
      }
    }
  }

  /** 吹き出しをタップしたら、その地点の高さを返す（なければ null） */
  hit(x: number, y: number): number | null {
    for (const a of this.hitAreas) {
      if (Math.abs(x - a.x) <= a.w / 2 && Math.abs(y - a.y) <= a.h / 2) return a.s;
    }
    return null;
  }
}
