/**
 * 設定と最高記録の保存（ブラウザの localStorage に保存）
 * プライベートブラウズなどで保存できない場合でも、ゲームは動くようにしている。
 */

export interface Settings {
  /** BGMの音量（0〜1） */
  bgmVolume: number;
  /** 効果音の音量（0〜1） */
  seVolume: number;
}

const SETTINGS_KEY = 'babeltd.settings';
const BEST_KEY = 'babeltd.bestFloor';

const DEFAULT_SETTINGS: Settings = { bgmVolume: 0.6, seVolume: 0.7 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* 保存領域が使えない環境 */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても続行 */
  }
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(floor: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(floor));
  } catch {
    /* 保存できなくても続行 */
  }
}
