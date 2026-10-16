/** 色の計算の補助関数 */

/** 2色の間を t（0〜1）で補間する */
export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** 色を明るく（amount > 0）または暗く（amount < 0）する */
export function shade(color: number, amount: number): number {
  return amount >= 0 ? lerpColor(color, 0xffffff, amount) : lerpColor(color, 0x000000, -amount);
}

/** 0xRRGGBB → '#rrggbb' */
export function toCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
