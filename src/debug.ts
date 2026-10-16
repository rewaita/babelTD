/**
 * デバッグ機能（調整用）
 * URLの末尾に ?debug を付けると有効になる。例: http://localhost:5173/?debug
 *
 * 有効時のキー操作（PC）:
 *   1 / 2 / 3 … ゲーム速度 ×1 / ×3 / ×10
 *   P         … ポイント +500
 *   F         … 塔を1階伸ばす
 */
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
