/**
 * ============================================================
 *  見た目・カメラ・アニメーションの設定（手動調整用）
 * ============================================================
 * 画面は「論理解像度」で設計しています（幅720px固定、高さは端末の縦横比で決まる）。
 * 実際の画面には自動で拡大縮小して表示されるので、ここの px はすべて論理px です。
 */

/** 画面レイアウト */
export const VIEW = {
  /** 論理的な画面の幅 */
  WIDTH: 720,
  /** 論理的な画面の高さの範囲（端末の縦横比に合わせてこの範囲で決まる） */
  MIN_HEIGHT: 1080,
  MAX_HEIGHT: 1600,
  /** 画面上部のバーの高さ */
  TOP_BAR_HEIGHT: 120,
  /** 画面下部のバーの高さ（トラップ一覧など） */
  BOTTOM_BAR_HEIGHT: 250,
  /** カメラの注視点を画面のどの高さに置くか（0 = 上端 / 1 = 下端） */
  FOCUS_Y_RATIO: 0.36,
};

/** 描画の重なり順（大きいほど手前に描かれる） */
export const DEPTH = {
  SKY: -10,
  TOWER_BACK: 0,
  TOWER_BODY: 1,
  TOWER_FRONT: 2,
  TRAPS: 3,
  ENEMIES: 4,
  WORKERS: 5,
  HORDE: 6,
  OVERLAY: 7,
  FLOAT_TEXT: 8,
  HUD: 100,
  GHOST: 120,
  POPUP: 150,
  TOAST: 160,
  MENU: 200,
};

/** 塔の見た目 */
export const TOWER_LOOK = {
  /** 塔の半径（px） */
  RADIUS: 210,
  /** 1階分の高さ（px） */
  FLOOR_HEIGHT: 100,
  /** 坂道の張り出しの幅（px） */
  RAMP_WIDTH: 34,
  /** 坂道の厚み（px） */
  RAMP_THICKNESS: 14,
  /** 見下ろす角度の強さ。大きいほど上から見下ろした感じになる（0 = 真横） */
  TILT: 0.15,
  /** 坂道1周を何分割して描くか（大きいほど滑らか、重くなる） */
  SEGMENTS_PER_FLOOR: 72,
  /** 石積みの目地の段数（1階あたり） */
  BRICK_ROWS_PER_FLOOR: 4,
  /** 空に浮かぶ雲の数と、雲が消えきる階数 */
  CLOUD_COUNT: 7,
  CLOUD_FADE_FLOOR: 40,
  /** 塔の胴体の陰影を何本の縦帯で描くか */
  BODY_STRIPS: 28,
  /** 円錐の太さの変化を、画面上で何pxごとに区切って描くか（小さいほど滑らか、重くなる） */
  BODY_BAND_PX: 24,
  /** 穴の高さ（坂道からの高さ。1階の高さを1とした比率） */
  HOLE_LIFT: 0.45,
  /** 穴の大きさ（正面から見たときのpx） */
  HOLE_W: 52,
  HOLE_H: 46,
  /** 穴を表示する最小の正面度（1 = 真正面 / 0 = 真横）。これより横向きの穴は表示しない */
  HOLE_MIN_Z: 0.25,
  /** 塔の天井（頂上）の高さ（頂上の坂道からの高さ、階） */
  CAP_LIFT: 0.62,
  /** 敵が坂道のどこを歩くか（0 = 壁際 / 1 = 外縁） */
  ENEMY_LANE: 0.55,

  COLORS: {
    BODY_LIGHT: 0xe2c48f,
    BODY_DARK: 0x4f3a29,
    RAMP_TOP_LIGHT: 0xf6e1b4,
    RAMP_TOP_DARK: 0x6e5539,
    RAMP_FACE_LIGHT: 0xae8858,
    RAMP_FACE_DARK: 0x3e2f1f,
    HOLE: 0x22160d,
    HOLE_FRAME: 0x7d5f3e,
    WORKER_HOLE_FRAME: 0xffcc55,
    CAP: 0xf2d9a8,
    SCAFFOLD: 0x6b4a2b,
    GROUND: 0x3a3024,
    GROUND_LIGHT: 0x55462f,
    HORDE_TOP: 0x4a1a63,
    HORDE_BOTTOM: 0x14061e,
    HORDE_EYE: 0xff4f6e,
    /** 空の色：地上付近 */
    SKY_LOW_TOP: 0x3a4f86,
    SKY_LOW_BOTTOM: 0xc79a7a,
    /** 空の色：高層（SKY_HIGH_FLOOR 階でこの色になる） */
    SKY_HIGH_TOP: 0x07040f,
    SKY_HIGH_BOTTOM: 0x2c1748,
  },
  /** 何階で空が「高層の色」になりきるか */
  SKY_HIGH_FLOOR: 120,
};

/**
 * 円錐の見た目（上を細く・下を太く見せる演出）
 * 見た目だけの引き伸ばしで、ゲームのデータには一切影響しない。
 * 画面の基準の高さ（CENTER_Y_RATIO）で今までどおりの太さになり、
 * そこから上へ行くほど細く・下へ行くほど太く描く。スクロールするとゆっくりズームしていくように見える。
 */
export const TAPER = {
  /**
   * 1階離れるごとに太さが何割変わるか（通常ズーム時）。0 で円柱に戻る。
   * 0.04 なら 5階上で約0.82倍 / 5階下で約1.22倍
   * 俯瞰モードではズームに比例して弱まるので、画面上での細まり方は同じくらいに保たれる
   */
  PER_FLOOR: 0.04,
  /**
   * 1階分の高さも太さと一緒に変えるか（0〜1）
   * 1 = 高さも縮む（上ほど階が詰まって見え、見上げるような遠近感が出る）
   * 0 = 太さだけ変わり、階の高さは一定
   */
  VERTICAL: 1.0,
  /** 基準の太さになる画面の高さ（0 = 上端 / 1 = 下端） */
  CENTER_Y_RATIO: 0.5,
};

/** カメラ */
export const CAMERA = {
  /** 頂上追従中、頂上から何階下の高さを注視するか */
  FOLLOW_OFFSET: 0.5,
  /** 頂上追従中の回転: 頂上から何階分手前の地点を真正面に向けるか（小さいほど作業員が正面に来る） */
  FOLLOW_ANGLE_OFFSET: 0.04,
  /** 追従の滑らかさ（大きいほど素早く追いつく） */
  FOLLOW_LERP: 5,
  /** 通常時（俯瞰ではないとき）のズーム。大きいほど塔に近づく */
  NORMAL_ZOOM: 1.3,
  /** 指をこれだけ（px）動かしたらスワイプとみなす（それ未満はタップ） */
  DRAG_THRESHOLD: 12,
  /**
   * 上下スワイプしたときに、どれだけ回転もするか。
   * 1.0 = 坂道に沿って回転しながら上下に移動（仕様どおり。常に坂道が画面中央に来る）
   * 0.0 = 回転せず真上・真下に移動
   */
  VERTICAL_DRAG_ROTATION: 1.0,
  /** マウスホイール1px あたりの移動量（階） */
  WHEEL_FLOORS_PER_PIXEL: 0.004,
  /** 俯瞰モード中の時間の速さ（0.3 = 30%） */
  OVERVIEW_TIME_SCALE: 0.3,
  /** 俯瞰モードの最小ズーム */
  OVERVIEW_MIN_ZOOM: 0.08,
  /** 俯瞰モードで上下に足す余白（階） */
  OVERVIEW_MARGIN_FLOORS: 1.5,
  /** ズーム切り替えの滑らかさ */
  ZOOM_LERP: 6,
};

/** アニメーション・操作感 */
export const ANIM = {
  /** 敵の大きさの倍率 */
  ENEMY_SCALE: 1,
  /** 敵の歩行の上下揺れ（速さ・高さpx） */
  ENEMY_BOB_SPEED: 11,
  ENEMY_BOB_HEIGHT: 3,
  /** 跳ね型の敵の跳ねる速さ・高さ（px） */
  JUMPER_BOB_SPEED: 7,
  JUMPER_BOB_HEIGHT: 16,
  /** 押し戻し・落下されたときの移動演出の時間（ミリ秒）と、放物線の高さ（px） */
  FORCE_ANIM_MS: 380,
  FORCE_ANIM_ARC: 40,
  /** 作業員の大きさの倍率 */
  WORKER_SCALE: 0.9,
  /** 作業員の作業アニメの速さ */
  WORKER_HAMMER_SPEED: 9,
  /** 穴の中のトラップアイコンの大きさの倍率 */
  TRAP_ICON_SCALE: 0.66,
  /** トラップが敵に効果を与えている間の拡大率 */
  TRAP_ACTIVE_PULSE: 1.15,
  /** 浮かび上がる文字（+3 など）の移動量と表示時間 */
  FLOAT_TEXT_RISE: 50,
  FLOAT_TEXT_MS: 800,
  /** 画面中央の通知の表示時間 */
  TOAST_MS: 1800,
  /** トラップをドラッグ中、指からどれだけ上にアイコンを表示するか（指で隠れないように） */
  PLACE_GHOST_OFFSET_Y: 70,
  /** ドラッグ中のアイコンがこの距離（px）以内の穴に吸い付く */
  HOLE_SNAP_RADIUS: 60,
  /** ダブルタップとみなす間隔（ミリ秒） */
  DOUBLE_TAP_MS: 380,
  /** 敵の集団のうねりの速さ */
  HORDE_WAVE_SPEED: 1.6,
};
