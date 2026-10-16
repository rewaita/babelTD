/**
 * アプリのアイコン（PNG）を生成するスクリプト
 * 実行: npm run icons   → public/icons/ に icon-192.png / icon-512.png / apple-touch-icon.png を書き出す
 *
 * 画像ソフトを使わず、ピクセルを1つずつ計算して描いている（紫の夜空に、螺旋の坂道がある円錐の塔）。
 * 本番のアイコン画像を用意したら、同じ名前で public/icons/ に置けば差し替わる（このスクリプトは不要になる）。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

/** 色の補間 */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));

/** 座標 (u, v)（0〜1）の色 [r, g, b] */
function colorAt(u, v) {
  // 背景: 上が濃い紫、下が明るい紫の夜空
  let c = mix([18, 10, 40], [86, 44, 110], v);
  // 頂上の光
  const glow = Math.hypot(u - 0.5, v - 0.2);
  c = mix(c, [255, 214, 110], Math.max(0, 1 - glow / 0.2) * 0.9);

  // 円錐の塔（下が太い）
  const top = 0.24;
  const bottom = 0.9;
  if (v >= top && v <= bottom) {
    const t = (v - top) / (bottom - top);
    const half = 0.12 + 0.17 * t;
    const dx = u - 0.5;
    if (Math.abs(dx) <= half) {
      // 円柱の陰影（左が明るい）
      const a = Math.asin(Math.max(-1, Math.min(1, dx / half)));
      const light = 0.55 + 0.45 * (-0.5 * Math.sin(a) + 0.85 * Math.cos(a));
      c = mix([79, 58, 41], [232, 200, 146], light);
      // 螺旋の坂道（斜めの帯）
      const ramp = (v * 9 - dx / half * 0.35 + 10) % 1;
      if (ramp < 0.18) c = mix(c, [255, 236, 190], 0.6);
      else if (ramp < 0.26) c = mix(c, [60, 44, 30], 0.6);
    }
  }
  // 頂上の天井
  if (Math.hypot((u - 0.5) / 0.12, (v - top) / 0.03) <= 1) c = [248, 226, 176];
  return c;
}

/** 1枚描いて PNG のバイト列にする（2×2 のサンプリングでなめらかに） */
function render(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // 各行の先頭はフィルタ種別（なし）
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = colorAt((x + ox) / size, (y + oy) / size);
        acc = acc.map((v, i) => v + c[i] / 4);
      }
      const p = y * (size * 4 + 1) + 1 + x * 4;
      raw[p] = Math.round(acc[0]);
      raw[p + 1] = Math.round(acc[1]);
      raw[p + 2] = Math.round(acc[2]);
      raw[p + 3] = 255;
    }
  }
  return png(size, size, raw);
}

// ---- PNG の書き出し（最低限） ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(outDir, name), render(size));
  console.log(`書き出し: public/icons/${name}`);
}
