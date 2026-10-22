/**
 * シミュレーションで使うデータの型
 */
import type { EnemyDef } from '../config/enemies';
import type { ForceKind, StatusKind, TrapDef } from '../config/traps';
import type { GodKind } from '../config/god';

/**
 * 穴（トラップの設置場所）の番号
 *   0以上 … 壁の穴（麓から順番）
 *   -1   … 作業員の左（後ろ側）の設置場所
 *   -2   … 作業員の右（前側）の設置場所
 */
export type SlotId = number;
export const WORKER_SLOT_LEFT: SlotId = -1;
export const WORKER_SLOT_RIGHT: SlotId = -2;
export const WORKER_SLOT_IDS: readonly SlotId[] = [WORKER_SLOT_LEFT, WORKER_SLOT_RIGHT];

/** 設置済みのトラップ1つ */
export interface PlacedTrap {
  /** 個体番号（描画の対応づけ用） */
  uid: number;
  def: TrapDef;
  /** 神の雷で停止している（効果なし。撤去するしかない） */
  disabled?: boolean;
}

/** 穴が与える状態異常1種類分 */
export interface StatusEffect {
  kind: StatusKind;
  power: number;
  duration: number;
  range: number;
}

/** 発動中のシナジー（表示用） */
export type SynergyKind = 'damage_damage' | 'delay_delay' | 'status_status' | 'status_damage';

/** 穴に入っているトラップの合計効果（シナジー込み）。トラップが変わるたびに計算し直す */
export interface SlotEffect {
  /** 毎秒ダメージ */
  dps: number;
  /** ダメージの範囲（階） */
  dmgRange: number;
  /** スロウ率 */
  slow: number;
  /** スロウの範囲（階） */
  slowRange: number;
  /** スロウの減衰の遅さの倍率（遅延＋遅延シナジーで増える） */
  slowDecayMul: number;
  /** 与える状態異常（最大2種類） */
  statuses: StatusEffect[];
  /** 状態異常のうち一番広い範囲（階） */
  statusRange: number;
  /** 強制移動（2つ入っていたら移動量の大きい方） */
  force: { kind: ForceKind; distance: number; range: number } | null;
  /** 発動中のシナジー（表示用） */
  synergies: SynergyKind[];
  /** どの効果でも届く最大の範囲 */
  maxRange: number;
}

/** 穴1つ */
export interface Slot {
  id: SlotId;
  traps: PlacedTrap[];
  effect: SlotEffect;
  /** 系統ごとの、次に発動できるまでの残り秒数（0以下なら発動できる） */
  cooldown: { damage: number; status: number; force: number };
  /** この時刻（ゲーム内秒）まで「発動中」の演出をする */
  activeUntil: number;
}

/** 敵にかかっている状態異常1種類分 */
export interface ActiveStatus {
  /** 強さ（毒: 毎秒ダメージ / 脆化: 被ダメージ増加率） */
  power: number;
  /** 残り秒数 */
  time: number;
}

/** 敵1体 */
export interface Enemy {
  uid: number;
  def: EnemyDef;
  /** 坂道上の位置（階） */
  s: number;
  hp: number;
  maxHp: number;
  /** 出現時の階数で決まった移動速度（階/秒） */
  speed: number;
  /** 作業員への毎秒ダメージ */
  attack: number;
  /** 撃破報酬 */
  reward: number;
  /** 出現時のレベル（＝出現時の到達階数） */
  level: number;
  /** 跳ね型: この偶奇（0/1）の番号の穴だけを踏む。跳ね型でなければ -1 */
  jumpParity: number;

  // ---- 遅延 ----
  /** 遅延を連続して受けている秒数（減衰の計算用） */
  slowExposure: number;
  /** 遅延を受けていない秒数（連続時間のリセット用） */
  slowIdle: number;
  /** 今かかっているスロウ率（描画用） */
  currentSlow: number;

  // ---- 状態異常 ----
  /** かかっている状態異常 */
  statuses: Partial<Record<StatusKind, ActiveStatus>>;
  /** 学習: その種類の状態異常を何回受けたか */
  statusCount: Partial<Record<StatusKind, number>>;
  /** その種類の状態異常を最後に受けた穴（同じ穴の範囲にいる間は回数を増やさない） */
  statusLastSlot: Partial<Record<StatusKind, SlotId>>;

  // ---- 強制移動 ----
  /** 学習: その種類の強制移動を何回受けたか */
  forceCount: Partial<Record<ForceKind, number>>;

  /** このステップでトラップから受けるダメージ（脆化の倍率をかける前）。毎ステップ 0 に戻る */
  pendingDamage: number;
  /** この時刻（ゲーム内秒）まで「ダメージを受けた」色にする */
  hurtUntil: number;
  /** 今ダメージを受けているか（描画用） */
  hurt: boolean;
  /** 作業員を攻撃中か */
  attacking: boolean;
}

/** 空中投下の予告 */
export interface PendingDrop {
  id: number;
  /** 降ってくる位置（階） */
  s: number;
  /** 降ってくる敵 */
  defs: EnemyDef[];
  /** 降ってくるまでの残り秒数 */
  timeLeft: number;
  /** 大型か（表示用） */
  big: boolean;
}

/** 操作の結果 */
export type ActionResult =
  | 'ok'
  | 'notEnough' // ポイント不足
  | 'full' // 穴が満杯
  | 'notBuilt' // まだ建設中の場所
  | 'locked' // まだ発明されていない
  | 'max' // 作業員が最大
  | 'invalid' // 無効な操作
  | 'sealed' // 技術封印で製造できない
  | 'noGenius' // 天才がいない
  | 'noTarget' // 天才を使う対象がない
  | 'gameOver';

/** 続いている神の妨害（妨害欄に並ぶ） */
export interface GodEffect {
  id: number;
  kind: Exclude<GodKind, 'lightning'>;
  /** 残り秒数。null なら天才で解決するまで続く */
  timeLeft: number | null;
  /** 技術封印: 封印されたトラップのID */
  trapId?: string;
}

/** 天才を使う対象 */
export type GeniusTarget =
  | { type: 'god'; id: number } // 妨害欄の妨害
  | { type: 'workers' } // 作業員
  | { type: 'trap'; defId: string }; // トラップの種類

/** シミュレーションから描画・UI側へ伝える出来事 */
export type WorldEvent =
  | { type: 'enemyKilled'; s: number; reward: number; color: number }
  | { type: 'workerDied'; remaining: number }
  | { type: 'floorReached'; floor: number }
  | { type: 'trapInvented'; def: TrapDef }
  | { type: 'forced'; s: number; kind: ForceKind; uid: number }
  | { type: 'evaded'; s: number; kind: ForceKind }
  | { type: 'dropWarning'; drop: PendingDrop }
  | { type: 'dropLanded'; drop: PendingDrop }
  | { type: 'lightning'; targets: { slotId: SlotId; s: number }[] }
  | { type: 'godStarted'; effect: GodEffect }
  | { type: 'godEnded'; effect: GodEffect; byGenius: boolean }
  | { type: 'geniusArrived'; count: number }
  | { type: 'geniusUsed'; target: GeniusTarget; result: 'resolved' | 'workerBuff' | 'upgrade' }
  | { type: 'gameOver'; floor: number };
