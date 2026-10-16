/**
 * ============================================================
 *  バランス計測用の自動プレイ（bot）
 * ============================================================
 * 画面なしでシミュレーションだけを高速に回し、「そこそこ上手い人」の遊び方で
 * 何階・何分でゲームオーバーになるかを計測する。数値を調整したら実行して確かめる。
 *
 * 実行: npm run balance            （5回の平均）
 *       npm run balance -- 10      （10回）
 *
 * 数値を一時的に変えて試す（設定ファイルは書き換えない）:
 *   OVERRIDE="ENEMY_SCALING.HP_MUL_PER_FLOOR=1.05,POINTS.PER_SECOND=4" npm run balance
 *
 * botの遊び方（人間がやりそうなこと）:
 *   - 作業員の横の2つの穴に、最優先でダメージ系を入れる
 *   - 新しく完成した上の階の穴から順に、決まった組み合わせでトラップを埋めていく
 *   - 余裕があれば作業員を少しずつ増やす
 *   - 雷で止まったトラップは（見えている範囲なら）撤去する
 *   - 天才は、妨害があれば解決に使い、なければ2人目以降を技術促進に使う
 *   - 空中投下の予告を見たら、降下地点〜頂上の間の穴にダメージ系を置いて迎え撃つ
 */
import { World } from '../src/sim/World';
import { TRAP_BY_ID, type TrapDef } from '../src/config/traps';
import * as BALANCE from '../src/config/balance';
import { TOWER, WORKERS } from '../src/config/balance';

// 数値の一時的な上書き（OVERRIDE="グループ.名前=値,..."）
for (const pair of (process.env.OVERRIDE ?? '').split(',').filter(Boolean)) {
  const [path, value] = pair.split('=');
  const [group, key] = path.split('.');
  const target = (BALANCE as unknown as Record<string, Record<string, number>>)[group];
  if (!target || !(key in target)) throw new Error(`不明な設定: ${path}`);
  target[key] = Number(value);
  console.log(`上書き: ${path} = ${value}`);
}
import { slotS } from '../src/sim/geometry';
import { WORKER_SLOT_IDS } from '../src/sim/types';

/** 何秒ごとにbotが判断するか */
const THINK_SEC = 0.5;
/** これ以上は計測を打ち切る（分） */
const MAX_MINUTES = 120;

/** 穴に入れる組み合わせ（穴の番号ごとに順番に使う）。名前は系統 */
const PATTERNS: ('damage' | 'delay' | 'status' | 'force')[][] = [
  ['damage', 'damage'],
  ['status', 'damage'],
  ['delay', 'damage'],
  ['damage', 'damage'],
  ['status', 'status'],
  ['force', 'damage'],
];

/** 系統ごとに、今使える一番良いトラップ */
function bestOf(w: World, category: string): TrapDef | undefined {
  const order: Record<string, string[]> = {
    damage: ['blade', 'spike'],
    delay: ['bell', 'glue'],
    status: ['weaken', 'poison'],
    force: ['gust'],
  };
  for (const id of order[category] ?? []) {
    const def = TRAP_BY_ID[id];
    if (def && w.isUnlocked(def) && !w.isSealed(def)) return def;
  }
  // 封印などで使えなければダメージ系で代用
  return category === 'damage' ? undefined : bestOf(w, 'damage');
}

/** 空中投下への対応: 降下地点より上の穴を、頂上に向かって埋めていく */
function reactToDrops(w: World, stats: { placed: number }): void {
  const perFloor = TOWER.SLOTS_PER_FLOOR;
  for (const drop of w.pendingDrops) {
    const first = Math.ceil(drop.s * perFloor);
    const last = Math.floor((w.top - TOWER.SLOT_BUILD_MARGIN) * perFloor - 0.5);
    for (let i = first; i <= last; i++) {
      while ((w.getSlot(i)?.traps.length ?? 0) < TOWER.TRAPS_PER_SLOT) {
        const def = bestOf(w, 'damage');
        if (!def || w.placeTrap(i, def.id) !== 'ok') return;
        stats.placed++;
      }
    }
  }
}

function think(w: World, stats: { placed: number }): void {
  reactToDrops(w, stats);
  // 天才
  if (w.geniuses > 0) {
    const effect = w.godEffects.find((g) => g.kind === 'strike') ?? w.godEffects[0];
    if (effect) w.useGenius({ type: 'god', id: effect.id });
    else if (w.geniuses >= 2) w.useGenius({ type: 'trap', defId: w.isUnlocked(TRAP_BY_ID.blade) ? 'blade' : 'spike' });
  }

  // 雷で止まったトラップを撤去（見えている範囲だけ）
  for (const slot of w.slots.values()) {
    if (slot.id >= 0 && slotS(slot.id) < w.hordeTop) continue;
    const i = slot.traps.findIndex((t) => t.disabled);
    if (i >= 0 && w.points >= w.removeCost(slot.traps[i].def)) w.removeTrap(slot.id, i);
  }

  // 作業員の横の穴を最優先
  for (const id of WORKER_SLOT_IDS) {
    while ((w.getSlot(id)?.traps.length ?? 0) < TOWER.TRAPS_PER_SLOT) {
      const def = bestOf(w, 'damage');
      if (!def || w.placeTrap(id, def.id) !== 'ok') break;
      stats.placed++;
    }
  }

  // 作業員: 階数に応じて少しずつ増やす（ポイントの半分以内で買えるなら）
  const targetWorkers = Math.min(WORKERS.MAX_COUNT, 3 + Math.floor(w.floor / 8));
  if (w.workers.length < targetWorkers && w.addWorkerCost() <= w.points * 0.5) w.addWorker();

  // 上の階の穴から順に埋める
  const perFloor = TOWER.SLOTS_PER_FLOOR;
  const highest = Math.floor((w.top - TOWER.SLOT_BUILD_MARGIN) * perFloor - 0.5);
  const lowest = Math.max(0, Math.floor(w.hordeTop * perFloor));
  for (let i = highest; i >= lowest; i--) {
    const slot = w.getSlot(i);
    const n = slot?.traps.length ?? 0;
    if (n >= TOWER.TRAPS_PER_SLOT) continue;
    const def = bestOf(w, PATTERNS[i % PATTERNS.length][n]);
    if (!def) return;
    if (w.placeTrap(i, def.id) !== 'ok') return; // お金がなければ次の判断まで待つ
    stats.placed++;
    if (n === 0) i++; // 同じ穴の2つ目をすぐ試す
  }
}

interface Result {
  seed: number;
  floor: number;
  minutes: number;
  kills: number;
  workers: number;
  traps: number;
}

function run(seed: number): Result {
  const w = new World(seed);
  const stats = { placed: 0 };
  let thinkTimer = 0;
  const dt = 1 / 60;
  const trace: string[] = [];
  while (!w.gameOver && w.time < MAX_MINUTES * 60) {
    w.update(dt);
    for (const ev of w.drainEvents()) {
      if (ev.type === 'floorReached' && ev.floor % 20 === 0) {
        trace.push(`${ev.floor}F:${(w.time / 60).toFixed(0)}分/敵${w.enemies.length}/◆${Math.floor(w.points)}`);
      }
    }
    thinkTimer -= dt;
    if (thinkTimer <= 0) {
      thinkTimer = THINK_SEC;
      think(w, stats);
    }
  }
  if (process.env.TRACE) {
    console.log('  ' + trace.join('  '));
    // 最後に作業員を攻撃していた敵（死因の手がかり）
    const attackers = w.enemies.filter((e) => e.attacking).map((e) => `${e.def.id}(Lv${e.level})`);
    const counts: Record<string, number> = {};
    for (const a of attackers) counts[a] = (counts[a] ?? 0) + 1;
    console.log('  最後の攻撃者: ' + JSON.stringify(counts) + `  妨害: ${w.godEffects.map((g) => g.kind).join(',')}`);
  }
  return { seed, floor: w.floor, minutes: w.time / 60, kills: w.kills, workers: w.workers.length, traps: stats.placed };
}

const runs = Number(process.argv[2] ?? 5);
const results: Result[] = [];
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const r = run(1000 + i * 7919);
  results.push(r);
  console.log(
    `seed ${r.seed}: ${r.floor}F  ${r.minutes.toFixed(1)}分  撃破${r.kills}  設置${r.traps}  作業員${r.workers}`,
  );
}
const avg = (f: (r: Result) => number) => results.reduce((s, r) => s + f(r), 0) / results.length;
console.log(
  `\n平均: ${avg((r) => r.floor).toFixed(1)}F / ${avg((r) => r.minutes).toFixed(1)}分` +
    `（最小 ${Math.min(...results.map((r) => r.floor))}F, 最大 ${Math.max(...results.map((r) => r.floor))}F）` +
    `  計測 ${((Date.now() - t0) / 1000).toFixed(1)}秒`,
);
console.log('目標: 100F前後（1階≒20秒のテンポ）');
