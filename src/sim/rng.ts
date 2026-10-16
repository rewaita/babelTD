/**
 * シード付きの乱数（mulberry32）
 * 同じシードなら同じ乱数列になる。内部状態を取り出し・戻せるので、
 * セーブ＆ロードしても同じ続きの乱数になる。
 */
export interface Rng {
  /** 0以上1未満の乱数 */
  (): number;
  /** 内部状態（セーブ用） */
  getState(): number;
  /** 内部状態を戻す（ロード用） */
  setState(state: number): void;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.getState = () => a;
  rng.setState = (s: number) => {
    a = s >>> 0;
  };
  return rng;
}

/** min 以上 max 以下の整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
