/**
 * ============================================================
 *  トラップの定義とシナジー（手動調整用）
 * ============================================================
 * 新しいトラップを足すときは TRAPS 配列に1行追加します。
 * unlockFloor の階に到達すると「発明」されて、画面下の一覧から使えるようになります。
 *
 * 効果範囲（range）は穴の中心からの片側の距離（階）です。
 * 穴どうしの間隔は 1 / TOWER.SLOTS_PER_FLOOR 階（6個なら約0.167階）なので、
 * 約0.083 で隣の穴との中間まで届きます。
 *
 * 系統ごとの性質:
 *   ダメージ … 範囲内の敵に継続ダメージ。学習の影響なし
 *   遅延     … 減速。連続してかかった秒数に応じて効果が減衰（balance.ts の SLOW）
 *   状態異常 … 範囲を出た後も効果が続く。同じ個体にかかった回数に応じて効果が減衰（balance.ts の STATUS）
 *   強制移動 … 敵を後ろへ戻す。同じ個体が受けるほど回避されやすくなる＝学習（balance.ts の FORCE）
 */

/** トラップの系統 */
export type TrapCategory = 'damage' | 'delay' | 'status' | 'force';

/** 状態異常の種類 */
export type StatusKind =
  | 'poison' // 毒: 毎秒ダメージ
  | 'weaken'; // 脆化: 受けるダメージが増える

/** 強制移動の種類 */
export type ForceKind =
  | 'knockback' // 坂道の後ろ方向へ押し戻す
  | 'drop'; // 塔の一段下（1周下）へ落とす

/** アイコンの種類（仮素材の描き分け用） */
export type TrapIcon = 'spike' | 'glue' | 'blade' | 'bell' | 'poison' | 'weaken' | 'gust' | 'pit';

export interface TrapDef {
  /** 内部ID（英数字） */
  id: string;
  /** 表示名 */
  name: string;
  /** 一覧をタップしたときに出る説明 */
  description: string;
  category: TrapCategory;
  /** 設置コスト（pt） */
  cost: number;
  /** この階に到達すると発明される（0 = 最初から使える） */
  unlockFloor: number;
  /** 効果範囲（階、穴の中心からの片側） */
  range: number;
  /** 【ダメージ】範囲内の敵に与える毎秒ダメージ */
  dps?: number;
  /** 【遅延】スロウ率（0.5 = 50%減速） */
  slow?: number;
  /** 【状態異常】種類・強さ・持続秒数 */
  status?: {
    kind: StatusKind;
    /** 毒: 毎秒ダメージ / 脆化: 受けるダメージの増加率（0.35 = +35%） */
    power: number;
    /** 範囲を出てから効果が続く秒数 */
    duration: number;
  };
  /** 【強制移動】種類と移動量 */
  force?: {
    kind: ForceKind;
    /** 戻す距離（階）。drop は 1.0（＝ちょうど1周下） */
    distance: number;
  };
  /** アイコンの背景色 */
  color: number;
  icon: TrapIcon;
}

export const TRAPS: TrapDef[] = [
  {
    id: 'spike',
    name: '棘の罠',
    description: '通過する敵に継続ダメージ',
    category: 'damage',
    cost: 40,
    unlockFloor: 0,
    range: 0.035,
    dps: 22,
    color: 0xb04a3a,
    icon: 'spike',
  },
  {
    id: 'glue',
    name: '粘着の罠',
    description: '敵を減速させる（受け続けると効果が弱まる）',
    category: 'delay',
    cost: 50,
    unlockFloor: 0,
    range: 0.045,
    slow: 0.5,
    color: 0x3c8f4e,
    icon: 'glue',
  },
  {
    id: 'poison',
    name: '毒の罠',
    description: '毒で継続ダメージ。範囲を出ても続く（同じ敵には効きが弱まる）',
    category: 'status',
    cost: 70,
    unlockFloor: 5,
    range: 0.04,
    status: { kind: 'poison', power: 10, duration: 4 },
    color: 0x7a3fa8,
    icon: 'poison',
  },
  {
    id: 'gust',
    name: '突風の罠',
    description: '敵を後ろへ押し戻す（同じ敵ほど見切られやすい）',
    category: 'force',
    cost: 80,
    unlockFloor: 8,
    range: 0.035,
    force: { kind: 'knockback', distance: 0.15 },
    color: 0x3f7fc0,
    icon: 'gust',
  },
  {
    id: 'blade',
    name: '回転刃',
    description: '強力な継続ダメージ',
    category: 'damage',
    cost: 95,
    unlockFloor: 10,
    range: 0.03,
    dps: 48,
    color: 0x8a8f9e,
    icon: 'blade',
  },
  {
    id: 'weaken',
    name: '脆化の呪符',
    description: '敵が受けるダメージを増やす。範囲を出ても続く',
    category: 'status',
    cost: 90,
    unlockFloor: 15,
    range: 0.04,
    status: { kind: 'weaken', power: 0.35, duration: 5 },
    color: 0x9a5a2a,
    icon: 'weaken',
  },
  {
    id: 'bell',
    name: '鈍重の鐘',
    description: '広い範囲の敵を強く減速させる',
    category: 'delay',
    cost: 120,
    unlockFloor: 20,
    range: 0.07,
    slow: 0.4,
    color: 0xc79a2e,
    icon: 'bell',
  },
  {
    id: 'pit',
    name: '落とし穴',
    description: '敵を塔の一段下へ落とす（同じ敵ほど見切られやすい）',
    category: 'force',
    cost: 150,
    unlockFloor: 25,
    range: 0.03,
    force: { kind: 'drop', distance: 1.0 },
    color: 0x2f2a3a,
    icon: 'pit',
  },
];

export const TRAP_BY_ID: Record<string, TrapDef> = Object.fromEntries(TRAPS.map((t) => [t.id, t]));

/**
 * 同じ穴に入れた2つのトラップの組み合わせ（シナジー）
 * 仕様で「特になし」の組み合わせ（ダメ＋遅延、異常＋遅延）と、強制移動を含む組み合わせは効果なし
 */
export const SYNERGY = {
  /** ダメージ＋ダメージ: ダメージと範囲が上がる */
  DAMAGE_DAMAGE: {
    /** 合計ダメージに掛ける倍率 */
    DPS_MUL: 1.25,
    /** 効果範囲に掛ける倍率 */
    RANGE_MUL: 1.6,
  },
  /** 遅延＋遅延: 効果の減衰が少なくなる */
  DELAY_DELAY: {
    /** 減衰の速さ（SLOW.DECAY_TIME）に掛ける倍率。大きいほど減衰しにくい */
    DECAY_TIME_MUL: 2.5,
    /** スロウ率に足す値 */
    SLOW_ADD: 0.1,
  },
  /** 状態異常＋状態異常: どちらの異常も強く・長くなる */
  STATUS_STATUS: {
    /** 強さに掛ける倍率 */
    POWER_MUL: 1.4,
    /** 持続秒数に掛ける倍率 */
    DURATION_MUL: 1.3,
  },
  /** 状態異常＋ダメージ: 状態異常によるダメージ（毒）が増える */
  STATUS_DAMAGE: {
    /** 毒の毎秒ダメージに掛ける倍率 */
    DOT_MUL: 1.6,
  },
};

/** 系統ごとの表示色（カード上部の帯など） */
export const CATEGORY_COLOR: Record<TrapCategory, number> = {
  damage: 0xe0604a,
  delay: 0x4fbf6a,
  status: 0xb064e0,
  force: 0x4f8fe0,
};
