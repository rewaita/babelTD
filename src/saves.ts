/**
 * ============================================================
 *  セーブデータの保存（ブラウザの localStorage）
 * ============================================================
 * 10階ごとに自動でセーブし、階ごとに1つずつ残す（10F・20F・30F …）。
 *
 * 歴史の分岐の扱い:
 *   ある階でセーブしたとき、それ以上の階のセーブは消す。
 *   （例: 30Fまでセーブがある状態で20Fをロードして遊び直し、20Fに到達してセーブすると、
 *         前の 20F・30F は消えて新しい 20F だけが残る）
 */
import { SNAPSHOT_VERSION, type WorldSnapshot } from './sim/World';

const KEY = 'babeltd.saves';

export interface SaveEntry {
  /** セーブした到達階数 */
  floor: number;
  /** セーブした日時（ミリ秒） */
  savedAt: number;
  data: WorldSnapshot;
}

/** セーブの一覧（階の低い順）。読めないデータや古い形式は除く */
export function listSaves(): SaveEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SaveEntry[];
    return list.filter((e) => e?.data?.version === SNAPSHOT_VERSION).sort((a, b) => a.floor - b.floor);
  } catch {
    return [];
  }
}

/** その階のセーブを書き込む（その階以上の古いセーブは消える）。保存できたら true */
export function writeSave(floor: number, data: WorldSnapshot): boolean {
  const list = listSaves().filter((e) => e.floor < floor);
  list.push({ floor, savedAt: Date.now(), data });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    // 容量オーバーなど: 古いセーブを減らしてもう一度
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(-3)));
      return true;
    } catch {
      return false;
    }
  }
}

/** すべてのセーブを消す */
export function clearSaves(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 保存領域が使えない環境 */
  }
}
