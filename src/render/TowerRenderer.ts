/**
 * ============================================================
 *  塔・空・地面・敵の集団の描画
 * ============================================================
 * 毎フレーム描き直しています。重なり順は次のとおり（奥から）:
 *   空 → 坂道の裏側 → 塔の胴体 → 坂道の手前側と穴 → （トラップ・敵・作業員）→ 敵の集団
 *
 * 描くのは画面に映る範囲だけで、「敵の集団」の上端より下は描きません。
 */
import Phaser from 'phaser';
import { DEPTH, TOWER_LOOK, ANIM } from '../config/visual';
import type { World } from '../sim/World';
import { slotIndexRange, slotS } from '../sim/geometry';
import { WORKER_SLOT_IDS, type SlotId } from '../sim/types';
import type { Projected, TowerView } from './TowerView';
import { lerpColor } from './color';

/** 画面に描いた穴の情報（タップやドラッグの当たり判定に使う） */
export interface HoleInfo {
  id: SlotId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** 円錐の見た目による拡大率 */
  k: number;
}

const TAU = Math.PI * 2;
const C = TOWER_LOOK.COLORS;

// 計算結果を書き込む使い回し用オブジェクト
const P1: Projected = { x: 0, y: 0, z: 0, k: 1 };
const P2: Projected = { x: 0, y: 0, z: 0, k: 1 };
const P3: Projected = { x: 0, y: 0, z: 0, k: 1 };
const P4: Projected = { x: 0, y: 0, z: 0, k: 1 };

/** 角度 a の面の明るさ（0〜1）。左手前から光が当たっている想定 */
function lightAt(a: number): number {
  return Math.max(0, Math.min(1, 0.5 + 0.5 * (-0.5 * Math.sin(a) + 0.85 * Math.cos(a))));
}

export class TowerRenderer {
  /** 今のフレームで画面に描いた穴の一覧 */
  readonly holes: HoleInfo[] = [];

  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly front: Phaser.GameObjects.Graphics;
  private readonly horde: Phaser.GameObjects.Graphics;
  private readonly stars: { x: number; y: number; r: number }[] = [];
  private readonly clouds: { x: number; y: number; w: number; speed: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly view: TowerView,
  ) {
    this.sky = scene.add.graphics().setDepth(DEPTH.SKY);
    this.back = scene.add.graphics().setDepth(DEPTH.TOWER_BACK);
    this.body = scene.add.graphics().setDepth(DEPTH.TOWER_BODY);
    this.front = scene.add.graphics().setDepth(DEPTH.TOWER_FRONT);
    this.horde = scene.add.graphics().setDepth(DEPTH.HORDE);
    for (let i = 0; i < TOWER_LOOK.CLOUD_COUNT; i++) {
      this.clouds.push({
        x: Math.random() * view.width,
        y: Math.random() * view.height * 1.5,
        w: 120 + Math.random() * 220,
        speed: 6 + Math.random() * 14,
      });
    }
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * view.width, y: Math.random() * view.height, r: 0.6 + Math.random() * 1.6 });
    }
  }

  /**
   * @param time アニメーション用の時刻（秒）
   * @param hiddenEnemies 集団に飲み込まれて見えない敵の数（集団のうねりの強さに使う）
   */
  draw(world: World, time: number, hiddenEnemies: number): void {
    const v = this.view;
    const [hMin, hMax] = v.visibleHeights();
    const base = world.hordeTop; // ここより下は描かない
    const top = world.top;

    this.drawSky(base, time);
    this.drawBody(base, top, hMin);

    this.back.clear();
    this.front.clear();
    const sStart = Math.max(base, hMin - 1);
    const sEnd = Math.min(top, hMax + 1);
    if (sEnd > sStart) this.drawRamp(sStart, sEnd);
    this.drawHoles(world, sStart, sEnd);
    this.drawHorde(base, time, hiddenEnemies);
  }

  // ------------------------------------------------------------

  private drawSky(base: number, time: number): void {
    const v = this.view;
    const g = this.sky;
    g.clear();
    const t = Math.min(1, v.camH / TOWER_LOOK.SKY_HIGH_FLOOR);
    const topColor = lerpColor(C.SKY_LOW_TOP, C.SKY_HIGH_TOP, t);
    const bottomColor = lerpColor(C.SKY_LOW_BOTTOM, C.SKY_HIGH_BOTTOM, t);
    g.fillGradientStyle(topColor, topColor, bottomColor, bottomColor, 1);
    g.fillRect(0, 0, v.width, v.height);

    // 低い所では雲が流れる（高く登るほど消えていく）
    const cloudAlpha = Math.max(0, 1 - v.camH / TOWER_LOOK.CLOUD_FADE_FLOOR) * 0.28;
    if (cloudAlpha > 0) {
      g.fillStyle(0xffffff, cloudAlpha);
      const span = v.height * 1.5;
      for (const c of this.clouds) {
        const x = ((((c.x + time * c.speed) % (v.width + c.w)) + v.width + c.w) % (v.width + c.w)) - c.w / 2;
        const y = ((((c.y + v.camH * 25) % span) + span) % span) - v.height * 0.25;
        g.fillEllipse(x, y, c.w, c.w * 0.28);
        g.fillEllipse(x + c.w * 0.22, y - c.w * 0.08, c.w * 0.5, c.w * 0.22);
      }
    }

    // 高く登るほど星が見えてくる
    const starAlpha = Math.max(0, Math.min(1, (v.camH - 15) / 60));
    if (starAlpha > 0) {
      g.fillStyle(0xffffff, starAlpha * 0.8);
      for (const s of this.stars) {
        const y = (((s.y + v.camH * 4) % v.height) + v.height) % v.height;
        g.fillCircle(s.x, y, s.r);
      }
    }

    // 地面（まだ集団に飲み込まれていないとき）
    if (base <= 0) {
      const y0 = v.axisY(0);
      if (y0 < v.height + 50) {
        g.fillStyle(C.GROUND, 1);
        const R0 = v.radiusAt(0);
        g.fillRect(0, y0 - R0 * TOWER_LOOK.TILT * 0.6, v.width, v.height);
        g.fillStyle(C.GROUND_LIGHT, 1);
        g.fillEllipse(v.cx, y0 + 4, R0 * 3.2, R0 * TOWER_LOOK.TILT * 3.2);
      }
    }
  }

  /**
   * 塔の胴体。円錐の見た目で高さごとに太さが変わるので、
   * 横方向の帯（BODY_BAND_PX ごと）× 縦の陰影の帯 の小さな四角形を並べて描く
   */
  private drawBody(base: number, top: number, hMin: number): void {
    const v = this.view;
    const g = this.body;
    g.clear();
    const hTop = top + TOWER_LOOK.CAP_LIFT;
    const hBottom = Math.max(base, hMin);
    if (hTop <= hBottom) return;

    // 縦の陰影の帯（ズームアウト中は本数を減らして軽くする）
    const n = Math.max(12, Math.round(TOWER_LOOK.BODY_STRIPS * Math.min(1, v.zoom)));
    const sinA: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i <= n; i++) sinA.push(Math.sin(-Math.PI / 2 + (Math.PI * i) / n));
    for (let i = 0; i < n; i++) {
      colors.push(lerpColor(C.BODY_DARK, C.BODY_LIGHT, lightAt(-Math.PI / 2 + (Math.PI * (i + 0.5)) / n)));
    }

    // 上から下へ、画面上でおよそ BODY_BAND_PX ごとに区切って描く
    let h0 = hTop;
    let y0 = v.axisY(h0);
    let r0 = v.radiusAt(h0);
    while (h0 > hBottom) {
      const h1 = Math.max(hBottom, h0 - TOWER_LOOK.BODY_BAND_PX / v.localFloorPx(h0));
      const y1 = v.axisY(h1) + 0.5; // 少し重ねて隙間を防ぐ
      const r1 = v.radiusAt(h1);
      for (let i = 0; i < n; i++) {
        const xa0 = v.cx + sinA[i] * r0, xb0 = v.cx + sinA[i + 1] * r0 + 0.5;
        const xa1 = v.cx + sinA[i] * r1, xb1 = v.cx + sinA[i + 1] * r1 + 0.5;
        g.fillStyle(colors[i], 1);
        g.fillTriangle(xa0, y0, xb0, y0, xb1, y1);
        g.fillTriangle(xa0, y0, xb1, y1, xa1, y1);
      }
      h0 = h1;
      y0 = y1;
      r0 = r1;
    }

    // 石積みの目地（細い横線）。1階を BRICK_ROWS_PER_FLOOR 段に分ける。小さく見えるときは省略
    if (v.zoom >= 0.5) {
      const rows = TOWER_LOOK.BRICK_ROWS_PER_FLOOR;
      g.lineStyle(Math.max(1, 1.5 * v.zoom), C.BODY_DARK, 0.22);
      const pts: { x: number; y: number }[] = [];
      for (let h = Math.ceil(hBottom * rows) / rows; h < hTop - 0.05; h += 1 / rows) {
        const r = v.radiusAt(h);
        const y = v.axisY(h);
        pts.length = 0;
        for (let i = 0; i <= 12; i++) {
          const a = -Math.PI / 2 + (Math.PI * i) / 12;
          pts.push({ x: v.cx + Math.sin(a) * r, y: y + Math.cos(a) * r * TOWER_LOOK.TILT });
        }
        g.strokePoints(pts, false);
      }
    }

    // 胴体の下端（地面との接地面）
    if (hBottom === base) {
      const Rb = v.radiusAt(base);
      g.fillStyle(lerpColor(C.BODY_DARK, C.BODY_LIGHT, 0.6), 1);
      g.fillEllipse(v.cx, v.axisY(base), Rb * 2, Rb * TOWER_LOOK.TILT * 2);
    }

    // 頂上の天井と、建設中の足場
    const R = v.radiusAt(hTop);
    const tilt = R * TOWER_LOOK.TILT;
    const capY = v.axisY(hTop);
    g.fillStyle(C.CAP, 1);
    g.fillEllipse(v.cx, capY, R * 2, tilt * 2);
    const k = v.scaleAt(hTop);
    g.lineStyle(Math.max(1.5, 4 * v.zoom * k), C.SCAFFOLD, 1);
    const poleH = v.localFloorPx(hTop) * 0.7;
    for (const a of [-1.0, -0.2, 0.7]) {
      const x = v.cx + Math.sin(a) * R * 0.8;
      const y = capY + Math.cos(a) * tilt * 0.8;
      g.lineBetween(x, y, x, y - poleH);
    }
    g.lineBetween(
      v.cx + Math.sin(-1.0) * R * 0.8, capY - poleH * 0.6,
      v.cx + Math.sin(0.7) * R * 0.8, capY - poleH * 0.6,
    );
  }

  /** 坂道: 上面（明るい帯）と側面（暗い帯）を短い区間ごとに描く */
  private drawRamp(sStart: number, sEnd: number): void {
    const v = this.view;
    // ズームアウト中は分割数を減らして軽くする
    const segments = Math.max(16, Math.round(TOWER_LOOK.SEGMENTS_PER_FLOOR * Math.min(1, v.zoom * 1.2)));
    const ds = 1 / segments;
    const RW = TOWER_LOOK.RAMP_WIDTH;
    const T0 = TOWER_LOOK.RAMP_THICKNESS * v.zoom;
    for (let s = Math.floor(sStart / ds) * ds; s < sEnd; s += ds) {
      const sa = Math.max(s, sStart);
      const sb = Math.min(s + ds + ds * 0.15, sEnd); // 少し重ねて隙間を防ぐ
      if (sb <= sa) continue;
      const amid = ((sa + sb) / 2 - v.camA) * TAU;
      const g = Math.cos(amid) >= 0 ? this.front : this.back;
      const i1 = v.project(sa, 0, 0, P1);
      const o1 = v.project(sa, 0, RW, P2);
      const i2 = v.project(sb, 0, 0, P3);
      const o2 = v.project(sb, 0, RW, P4);
      const lt = lightAt(amid);
      const T = T0 * o1.k;

      // 四角形を三角形2枚で描く（fillPath より大幅に軽い）
      g.fillStyle(lerpColor(C.RAMP_TOP_DARK, C.RAMP_TOP_LIGHT, lt), 1);
      g.fillTriangle(i1.x, i1.y, i2.x, i2.y, o2.x, o2.y);
      g.fillTriangle(i1.x, i1.y, o2.x, o2.y, o1.x, o1.y);

      g.fillStyle(lerpColor(C.RAMP_FACE_DARK, C.RAMP_FACE_LIGHT, lt), 1);
      g.fillTriangle(o1.x, o1.y, o2.x, o2.y, o2.x, o2.y + T);
      g.fillTriangle(o1.x, o1.y, o2.x, o2.y + T, o1.x, o1.y + T);
    }
  }

  /** 壁の穴（手前側だけ）と、作業員の横の穴 */
  private drawHoles(world: World, sStart: number, sEnd: number): void {
    this.holes.length = 0;
    const [first, last] = slotIndexRange(sStart, sEnd);
    for (let i = Math.max(0, first); i <= last; i++) {
      if (!world.isSlotBuilt(i)) continue;
      this.drawHole(i, slotS(i), C.HOLE_FRAME);
    }
    for (const id of WORKER_SLOT_IDS) this.drawHole(id, world.slotS(id), C.WORKER_HOLE_FRAME);
  }

  private drawHole(id: SlotId, s: number, frameColor: number): void {
    const v = this.view;
    const p = v.project(s, TOWER_LOOK.HOLE_LIFT, 0, P1);
    if (p.z < TOWER_LOOK.HOLE_MIN_Z) return;
    if (p.y < -60 || p.y > v.height + 60) return;
    // 横向きの穴ほど細く見える
    const zk = v.zoom * p.k; // ズーム × 円錐の拡大率
    const w = TOWER_LOOK.HOLE_W * zk * p.z;
    const h = TOWER_LOOK.HOLE_H * zk;
    const g = this.front;
    const frame = Math.max(2, 4 * zk);
    g.fillStyle(frameColor, 1);
    if (zk < 0.6) {
      // 小さく見えているときは角丸をやめて軽くする
      g.fillRect(p.x - w / 2 - frame, p.y - h / 2 - frame, w + frame * 2, h + frame * 2);
      g.fillStyle(C.HOLE, 1);
      g.fillRect(p.x - w / 2, p.y - h / 2, w, h);
    } else {
      const r = Math.min(10 * zk, w / 2, h / 2);
      g.fillRoundedRect(p.x - w / 2 - frame, p.y - h / 2 - frame, w + frame * 2, h + frame * 2, Math.min(r + frame, (w + frame * 2) / 2));
      g.fillStyle(C.HOLE, 1);
      g.fillRoundedRect(p.x - w / 2, p.y - h / 2, w, h, r);
    }
    this.holes.push({ id, x: p.x, y: p.y, w, h, z: p.z, k: p.k });
  }

  /** 敵の集団: 下層を覆う、うごめく闇 */
  private drawHorde(base: number, time: number, hiddenEnemies: number): void {
    const v = this.view;
    const g = this.horde;
    g.clear();
    if (base <= 0) return;
    const yTop = v.axisY(base) + v.radiusAt(base) * TOWER_LOOK.TILT;
    const zk = Math.max(0.4, v.zoom * v.scaleAt(base));
    if (yTop > v.height + 80) return;
    g.fillGradientStyle(C.HORDE_TOP, C.HORDE_TOP, C.HORDE_BOTTOM, C.HORDE_BOTTOM, 1);
    g.fillRect(0, yTop, v.width, Math.max(0, v.height - yTop));

    // 下にいる敵の多さ（0〜1）。多いほど上端に頭が密集し、目が増える
    const density = Math.min(1, hiddenEnemies / ANIM.HORDE_FULL_COUNT);
    const speed = ANIM.HORDE_WAVE_SPEED;

    // 上端のうねり
    const bumps = 14;
    const step = v.width / bumps;
    g.fillStyle(C.HORDE_TOP, 1);
    for (let k = 0; k <= bumps; k++) {
      const r = (24 + 12 * Math.sin(time * speed + k * 1.9)) * (0.7 + 0.6 * density) * zk;
      g.fillCircle(k * step, yTop + 6, r);
    }

    // ひしめく頭（奥の列ほど暗く小さい）。位置は番号から決めるので毎フレーム同じ場所で揺れる
    const heads = Math.round(ANIM.HORDE_MAX_HEADS * density);
    for (let k = 0; k < heads; k++) {
      const row = k % 3;
      const x = (k * 61.7 + row * 23) % (v.width + 40) - 20;
      const bob = Math.sin(time * (speed * 2.2) + k * 2.7) * 6 * zk;
      const y = yTop - (8 - row * 10) * zk + bob;
      const r = (16 - row * 3 + (k % 5)) * zk;
      g.fillStyle(lerpColor(C.HORDE_EDGE, C.HORDE_TOP, row / 2), 1);
      g.fillCircle(x, y, r);
    }

    // 赤い目（ちらちら瞬く）。多いほど深いところまで光る
    const eyes = Math.round(4 + (ANIM.HORDE_MAX_EYES - 4) * density);
    const depth = (40 + 260 * density) * zk;
    for (let k = 0; k < eyes; k++) {
      const blink = Math.sin(time * 2.3 + k * 7.1);
      if (blink < -0.3) continue;
      const x = (k * 97.3) % v.width;
      const y = yTop + 10 * zk + ((k * 37.9) % 100) / 100 * depth;
      const size = zk * (k < heads ? 1.2 : 0.9);
      g.fillStyle(C.HORDE_EYE, 0.5 + 0.5 * blink);
      g.fillEllipse(x - 5 * size, y, 6 * size, 4 * size);
      g.fillEllipse(x + 5 * size, y, 6 * size, 4 * size);
    }
  }

  // ------------------------------------------------------------
  //  当たり判定
  // ------------------------------------------------------------

  /** 指定位置に重なっている穴（タップ用） */
  hitHole(x: number, y: number): HoleInfo | null {
    let best: HoleInfo | null = null;
    let bestD = Infinity;
    for (const h of this.holes) {
      const hw = Math.max(h.w / 2, 22) + 8;
      const hh = h.h / 2 + 8;
      if (Math.abs(x - h.x) <= hw && Math.abs(y - h.y) <= hh) {
        const d = Math.hypot(x - h.x, y - h.y);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
    }
    return best;
  }

  /** 指定位置から radius 以内で一番近い穴（ドラッグ中の吸い付き用） */
  nearestHole(x: number, y: number, radius: number): HoleInfo | null {
    let best: HoleInfo | null = null;
    let bestD = radius;
    for (const h of this.holes) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  findHole(id: SlotId): HoleInfo | undefined {
    return this.holes.find((h) => h.id === id);
  }
}
