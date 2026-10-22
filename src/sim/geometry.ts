/**
 * 塔の「坂道上の位置」に関する計算
 *
 * 坂道上の位置は、麓からの道のり s（単位: 階）という1つの数値で表します。
 *   s = 0    … 麓（坂道の始まり）
 *   s = 1.0  … 1周して2階の始まり
 *   s = 12.35… 13階目の、1周の35%進んだ地点
 * 敵・作業員・穴の位置はすべて s で管理します。
 *
 * 壁の穴には麓から順に番号（スロット番号）を振っています。
 *   番号 i の穴の位置は s = (i + 0.5) / 1階あたりの穴の数
 */
import { TOWER } from '../config/balance';

/** 穴どうしの間隔（階） */
export const SLOT_SPACING = 1 / TOWER.SLOTS_PER_FLOOR;

/** 穴番号 → 坂道上の位置 s */
export function slotS(index: number): number {
  return (index + 0.5) * SLOT_SPACING;
}

/** 位置の範囲 [sMin, sMax] に含まれる穴番号の範囲 [最初, 最後] を返す（最初 > 最後 なら該当なし） */
export function slotIndexRange(sMin: number, sMax: number): [number, number] {
  // + 0 は -0 を 0 にするため
  return [Math.ceil(sMin / SLOT_SPACING - 0.5) + 0, Math.floor(sMax / SLOT_SPACING - 0.5) + 0];
}
