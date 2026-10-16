/**
 * ============================================================
 *  敵（呪い）の定義（手動調整用）
 * ============================================================
 * 新しい敵を足すときは、ENEMIES 配列に1行追加するだけです。
 * 見た目（テクスチャ）は look と color から自動生成されます（src/render/textures.ts）。
 *
 * 数値はすべて「0階で出現したとき」の値です。
 * 階数が上がると balance.ts の ENEMY_SCALING に従って強くなります。
 *
 * 特殊な性質:
 *   jump         … 跳ね型。穴を一個飛ばしで踏むので、壁の穴の半分のトラップを無視する
 *   statusImmune … 状態異常が効かない
 *   dropOnly     … 麓からは出ず、空中投下（balance.ts の AIRDROP）でだけ現れる
 */

/** 見た目の種類（仮素材の描き分け用） */
export type EnemyLook = 'blob' | 'spiky' | 'horned' | 'hopper' | 'warded' | 'giant';

export interface EnemyDef {
  /** 内部ID（英数字） */
  id: string;
  /** 表示名 */
  name: string;
  /** 体力 */
  hp: number;
  /** 移動速度（階/秒）。参考: 作業員3人の建設速度は 0.05階/秒 */
  speed: number;
  /** 作業員への攻撃力（毎秒のダメージ） */
  attack: number;
  /** 倒したときに得られるポイント */
  reward: number;
  /** この階数に達すると出現し始める */
  minFloor: number;
  /** 麓からの出現のしやすさ（出現できる敵どうしの比率）。0 なら麓からは出ない */
  weight: number;
  /** 色（0xRRGGBB） */
  color: number;
  /** 見た目の大きさ（px） */
  size: number;
  look: EnemyLook;
  /** 跳ね型（壁の穴を一個飛ばしで無視する） */
  jump?: boolean;
  /** 状態異常が効かない */
  statusImmune?: boolean;
  /** 空中投下でだけ現れる */
  dropOnly?: boolean;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'basic',
    name: '呪いの泥',
    hp: 20,
    speed: 0.15,
    attack: 4,
    reward: 3,
    minFloor: 0,
    weight: 10,
    color: 0x7b4fd6,
    size: 40,
    look: 'blob',
  },
  {
    id: 'fast',
    name: '疾き呪い',
    hp: 12,
    speed: 0.27,
    attack: 3,
    reward: 4,
    minFloor: 6,
    weight: 4,
    color: 0x3fb6c9,
    size: 34,
    look: 'spiky',
  },
  {
    id: 'jumper',
    name: '跳ねる呪い',
    hp: 18,
    speed: 0.17,
    attack: 4,
    reward: 5,
    minFloor: 8,
    weight: 3,
    color: 0x7fc94a,
    size: 38,
    look: 'hopper',
    jump: true,
  },
  {
    id: 'tank',
    name: '重き呪い',
    hp: 75,
    speed: 0.09,
    attack: 8,
    reward: 10,
    minFloor: 12,
    weight: 2,
    color: 0xc9483f,
    size: 52,
    look: 'horned',
  },
  {
    id: 'warded',
    name: '護られし呪い',
    hp: 32,
    speed: 0.13,
    attack: 5,
    reward: 8,
    minFloor: 18,
    weight: 2,
    color: 0xe0d6f0,
    size: 42,
    look: 'warded',
    statusImmune: true,
  },
  {
    id: 'giant',
    name: '堕ちた巨人',
    hp: 90,
    speed: 0.07,
    attack: 8,
    reward: 35,
    minFloor: 0,
    weight: 0,
    color: 0x5a3b8c,
    size: 66,
    look: 'giant',
    dropOnly: true,
  },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
