/**
 * ============================================================
 *  カメラと円筒投影（擬似3D）＋ 円錐の見た目
 * ============================================================
 * 塔は円柱として扱い、坂道上の位置 s（階）を画面座標に変換します。
 *
 *   角度 a = (s - camA) × 2π   … 坂道は1階で1周する
 *   画面x = 中心 + sin(a) × 半径
 *   奥行z = cos(a)              … 1 = 真正面（手前） / 0 = 真横 / -1 = 真裏
 *   画面y = 高さで決まる位置 + z × 半径 × TILT   … 手前ほど少し下に見える（見下ろし感）
 *
 * 上から見て反時計回りに s が増えるので、横から見ると手前側で「左から右へ」上がっていく。
 *
 * 【円錐の見た目】（設定は visual.ts の TAPER）
 *   高さ h の場所は、基準の高さ hRef（画面の CENTER_Y_RATIO の位置）からの距離 u = h - hRef に応じて
 *   倍率 k = e^(-a・u) で拡大縮小して描く（上ほど小さく、下ほど大きい）。
 *   半径・坂道・穴・敵・作業員の大きさにすべて k を掛ける。データ（World）は一切変えない。
 *   縦方向の位置も k に合わせて詰める（TAPER.VERTICAL）。
 *     縦の位置 = 基準位置 - 1階の高さ × F(u)
 *     F(u) = VERTICAL × (1 - e^(-a・u)) / a + (1 - VERTICAL) × u   … k を高さ方向に積分したもの
 *
 * カメラは2つの値を持つ:
 *   camH … 見ている高さ（階）
 *   camA … 見ている角度（階単位。camA = s の点が真正面に来る）
 */
import { CAMERA, TAPER, TOWER_LOOK, VIEW } from '../config/visual';

export interface Projected {
  x: number;
  y: number;
  /** 奥行（1 = 手前 / -1 = 裏） */
  z: number;
  /** 円錐の見た目による、その高さでの拡大率（大きさに掛ける） */
  k: number;
}

const TAU = Math.PI * 2;

export class TowerView {
  camH = 0;
  camA = 0;
  zoom = 1;
  targetZoom = 1;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** 塔の中心のx座標 */
  get cx(): number {
    return this.width / 2;
  }

  /** カメラの注視点の画面y座標 */
  get focusY(): number {
    return this.height * VIEW.FOCUS_Y_RATIO;
  }

  /** 円錐の基準になる画面y座標 */
  get taperY(): number {
    return this.height * TAPER.CENTER_Y_RATIO;
  }

  /** 基準の太さで描かれる、1階分の画面上の高さ（px） */
  get floorPx(): number {
    return TOWER_LOOK.FLOOR_HEIGHT * this.zoom;
  }

  /** 基準の太さになる高さ（階） */
  get hRef(): number {
    return this.camH - (this.taperY - this.focusY) / this.floorPx;
  }

  // ------------------------------------------------------------
  //  円錐の計算
  // ------------------------------------------------------------

  /** 細まり方の強さ（ズームに比例させて、画面上の見た目を揃える） */
  private taperA(zoom = this.zoom): number {
    return TAPER.PER_FLOOR * (zoom / CAMERA.NORMAL_ZOOM);
  }

  /** 基準の高さから u 階離れた場所の、縦方向の距離（階単位） */
  private F(u: number, zoom = this.zoom): number {
    const a = this.taperA(zoom);
    if (a < 1e-6) return u;
    const v = TAPER.VERTICAL;
    return (v * (1 - Math.exp(-a * u))) / a + (1 - v) * u;
  }

  /** F の逆計算（二分法）。上に行きすぎて届かない場合は大きな値を返す */
  private Finv(val: number, zoom = this.zoom): number {
    // 答えを挟む範囲 [lo, hi] を広げながら探す
    let step = 1;
    while (this.F(val - step, zoom) > val && step < 1e5) step *= 2;
    let lo = val - step;
    step = 1;
    while (this.F(val + step, zoom) < val) {
      step *= 2;
      if (step > 1e5) return 1e5; // 上に行きすぎて届かない
    }
    let hi = val + step;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.F(mid, zoom) < val) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** 高さ h（階）での拡大率 */
  scaleAt(h: number): number {
    return Math.exp(-this.taperA() * (h - this.hRef));
  }

  /** 高さ h での塔の半径（画面px） */
  radiusAt(h: number): number {
    return TOWER_LOOK.RADIUS * this.zoom * this.scaleAt(h);
  }

  /** 高さ h 付近での、1階分の画面上の高さ（px） */
  localFloorPx(h: number): number {
    const v = TAPER.VERTICAL;
    return this.floorPx * (v * this.scaleAt(h) + (1 - v));
  }

  // ------------------------------------------------------------
  //  座標変換
  // ------------------------------------------------------------

  /**
   * 坂道上の位置を画面座標に変換する
   * @param s 坂道上の位置（階）
   * @param lift 坂道からの高さ（階単位。0.45 なら 1階の高さの45%上）
   * @param radiusAdd 塔の表面からの張り出し（論理px。ズーム前）
   * @param out 結果を書き込むオブジェクト（使い回して軽くするため）
   */
  project(s: number, lift = 0, radiusAdd = 0, out: Projected = { x: 0, y: 0, z: 0, k: 1 }): Projected {
    const h = s + lift;
    const k = this.scaleAt(h);
    const a = (s - this.camA) * TAU;
    const r = (TOWER_LOOK.RADIUS + radiusAdd) * this.zoom * k;
    const z = Math.cos(a);
    out.x = this.cx + Math.sin(a) * r;
    out.y = this.axisY(h) + z * r * TOWER_LOOK.TILT;
    out.z = z;
    out.k = k;
    return out;
  }

  /** 塔の中心軸上で、高さ h（階）が画面のどのyに来るか */
  axisY(h: number): number {
    return this.taperY - this.floorPx * this.F(h - this.hRef);
  }

  /** 画面のy座標 → 高さ（階） */
  yToHeight(y: number): number {
    return this.hRef + this.Finv((this.taperY - y) / this.floorPx);
  }

  /** 画面に映っている高さの範囲 [下, 上]（少し余白込み） */
  visibleHeights(): [number, number] {
    const margin = 150 * this.zoom;
    return [this.yToHeight(this.height + margin * 2), this.yToHeight(-margin)];
  }

  /**
   * 俯瞰モード用: 高さ hBottom〜hTop が画面の yTop〜yBottom にちょうど収まるズームとカメラ高さを求める
   * （円錐の見た目で縦の間隔が変わるので、数回くり返して合わせる）
   */
  fitRange(hBottom: number, hTop: number, yTop: number, yBottom: number, maxZoom: number, minZoom: number): { zoom: number; camH: number } {
    const span = hTop - hBottom;
    let zoom = (yBottom - yTop) / (span * TOWER_LOOK.FLOOR_HEIGHT);
    for (let i = 0; i < 6; i++) {
      zoom = Math.min(maxZoom, Math.max(minZoom, zoom));
      const floorPx = TOWER_LOOK.FLOOR_HEIGHT * zoom;
      const uTop = this.Finv((this.taperY - yTop) / floorPx, zoom);
      const spanPx = floorPx * (this.F(uTop, zoom) - this.F(uTop - span, zoom));
      zoom *= (yBottom - yTop) / spanPx;
    }
    zoom = Math.min(maxZoom, Math.max(minZoom, zoom));
    const floorPx = TOWER_LOOK.FLOOR_HEIGHT * zoom;
    const uTop = this.Finv((this.taperY - yTop) / floorPx, zoom);
    const hRef = hTop - uTop;
    return { zoom, camH: hRef + (this.taperY - this.focusY) / floorPx };
  }
}
