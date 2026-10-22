/**
 * シミュレーションのテスト（npm test で実行）
 * 数値を調整したときに「ゲームとして壊れていないか」を確かめる用途。
 */
import { describe, expect, it } from 'vitest';
import { AIRDROP, ENEMY_SCALING, POINTS, SAVE, STATUS, TOWER, WORKERS } from '../config/balance';
import { ENEMIES, ENEMY_BY_ID } from '../config/enemies';
import { SYNERGY, TRAP_BY_ID, TRAP_INTERVAL, TRAP_TARGETS } from '../config/traps';
import { GENIUS, GOD } from '../config/god';
import { slotIndexRange, slotS } from './geometry';
import { computeSlotEffect } from './slotEffect';
import { WORKER_SLOT_LEFT } from './types';
import { World } from './World';

describe('geometry', () => {
  it('穴の位置と範囲検索が対応している', () => {
    const n = TOWER.SLOTS_PER_FLOOR;
    expect(slotS(0)).toBeCloseTo(0.5 / n);
    expect(slotS(n)).toBeCloseTo(1 + 0.5 / n);
    expect(slotIndexRange(0.0, 1 / n)).toEqual([0, 0]);
    expect(slotIndexRange(0.4 / n, 2.6 / n)).toEqual([0, 2]);
  });
});

describe('World', () => {
  it('基準人数なら SECONDS_PER_FLOOR 秒で1階伸びる', () => {
    const w = new World(1);
    expect(w.buildRate()).toBeCloseTo(1 / WORKERS.SECONDS_PER_FLOOR);
  });

  it('設置・撤去・移動でポイントが正しく減る', () => {
    const w = new World(1);
    w.points = 1000;
    const spike = TRAP_BY_ID.spike;
    expect(w.placeTrap(0, 'spike')).toBe('ok');
    expect(w.points).toBe(1000 - spike.cost);
    expect(w.placeTrap(0, 'spike')).toBe('ok');
    expect(w.placeTrap(0, 'spike')).toBe('full');
    const before = w.points;
    expect(w.moveTrap(0, 0, 1)).toBe('ok');
    expect(w.points).toBe(before - Math.ceil(spike.cost * POINTS.REMOVE_COST_RATIO));
    expect(w.removeTrap(1, 0)).toBe('ok');
    expect(w.getSlot(1)).toBeUndefined();
  });

  it('建設中の穴には置けない', () => {
    const w = new World(1);
    w.points = 1000;
    expect(w.placeTrap(999, 'spike')).toBe('notBuilt');
    expect(w.placeTrap(WORKER_SLOT_LEFT, 'spike')).toBe('ok');
  });

  it('トラップを通った敵はダメージを受けて倒れる', () => {
    const w = new World(1);
    w.points = 10000;
    for (let i = 0; i < TOWER.SLOTS_PER_FLOOR; i++) w.placeTrap(i, 'spike');
    const e = w.spawnEnemy(ENEMIES[0], 0);
    for (let t = 0; t < 10 * 60; t++) w.update(1 / 60);
    expect(w.enemies.includes(e)).toBe(false);
    expect(w.kills).toBeGreaterThan(0);
  });

  it('トラップが無ければいずれ作業員が全滅してゲームオーバー', () => {
    const w = new World(1);
    for (let t = 0; t < 600 * 60 && !w.gameOver; t++) w.update(1 / 60);
    expect(w.gameOver).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'gameOver')).toBe(true);
  });
});

describe('enemy scaling', () => {
  it('出現時のHPは到達階数で決まり、出現後は変わらない', () => {
    const w = new World(1);
    const e1 = w.spawnEnemy(ENEMIES[0], 0);
    const hp1 = e1.maxHp;
    w.debugAddFloors(10);
    expect(e1.maxHp).toBe(hp1);
    const e2 = w.spawnEnemy(ENEMIES[0], 0);
    expect(e2.maxHp).toBeCloseTo(hp1 * ENEMY_SCALING.HP_MUL_PER_FLOOR ** 10);
  });
});

describe('synergy', () => {
  it('ダメージ＋ダメージでダメージと範囲が上がる', () => {
    const spike = TRAP_BY_ID.spike;
    const eff = computeSlotEffect([
      { uid: 1, def: spike },
      { uid: 2, def: spike },
    ]);
    expect(eff.dps).toBeCloseTo(spike.dps! * 2 * SYNERGY.DAMAGE_DAMAGE.DPS_MUL);
    expect(eff.dmgRange).toBeCloseTo(spike.range * SYNERGY.DAMAGE_DAMAGE.RANGE_MUL);
    expect(eff.synergies).toContain('damage_damage');
  });

  it('遅延＋遅延で減衰が遅くなる', () => {
    const glue = TRAP_BY_ID.glue;
    const eff = computeSlotEffect([
      { uid: 1, def: glue },
      { uid: 2, def: glue },
    ]);
    expect(eff.slowDecayMul).toBe(SYNERGY.DELAY_DELAY.DECAY_TIME_MUL);
    expect(eff.synergies).toContain('delay_delay');
  });
});

describe('M2: 状態異常・強制移動・学習・特殊な敵', () => {
  /** 塔を高くして、全トラップを使える状態の World を作る */
  function bigWorld(): World {
    const w = new World(42);
    w.debugAddFloors(40);
    w.drainEvents();
    w.points = 1e6;
    return w;
  }

  it('毒は範囲を出た後もダメージを与え、別の穴でかかるたびに弱まる', () => {
    const w = bigWorld();
    // 2つ目の穴は、1つ目の毒が切れてから届くくらい離す
    w.placeTrap(0, 'poison');
    w.placeTrap(5, 'poison');
    const e = w.spawnEnemy(ENEMY_BY_ID.tank, 0);
    e.hp = e.maxHp = 1e9; // 倒れないように
    const powers: number[] = [];
    for (let t = 0; t < 15 * 60; t++) {
      w.update(1 / 60);
      const p = e.statuses.poison?.power;
      if (p !== undefined && powers[powers.length - 1] !== p) powers.push(p);
    }
    expect(e.statusCount.poison).toBe(2);
    expect(powers[0]).toBeCloseTo(TRAP_BY_ID.poison.status!.power);
    expect(powers).toContainEqual(expect.closeTo(TRAP_BY_ID.poison.status!.power * STATUS.DECAY_PER_APPLY, 5));
  });

  it('状態異常無効の敵には毒がかからない', () => {
    const w = bigWorld();
    w.placeTrap(0, 'poison');
    const e = w.spawnEnemy(ENEMY_BY_ID.warded, 0);
    for (let t = 0; t < 2 * 60; t++) w.update(1 / 60);
    expect(e.statuses.poison).toBeUndefined();
  });

  it('突風で押し戻されても、学習していずれ通り抜ける（無限ループにならない）', () => {
    const w = bigWorld();
    w.placeTrap(2, 'gust');
    const e = w.spawnEnemy(ENEMY_BY_ID.tank, 0);
    e.hp = e.maxHp = 1e9;
    for (let t = 0; t < 120 * 60 && e.s < 1; t++) w.update(1 / 60);
    expect(e.forceCount.knockback ?? 0).toBeGreaterThan(0);
    expect(e.s).toBeGreaterThanOrEqual(1);
  });

  it('落とし穴は1周下に落とす', () => {
    const w = bigWorld();
    const pitSlot = TOWER.SLOTS_PER_FLOOR * 2; // 3階目の最初の穴
    w.placeTrap(pitSlot, 'pit');
    const e = w.spawnEnemy(ENEMY_BY_ID.tank, slotS(pitSlot) - 0.05);
    e.hp = e.maxHp = 1e9;
    let dropped = false;
    for (let t = 0; t < 3 * 60 && !dropped; t++) {
      w.update(1 / 60);
      dropped = w.drainEvents().some((ev) => ev.type === 'forced' && ev.kind === 'drop');
    }
    expect(dropped).toBe(true);
    expect(e.s).toBeLessThan(slotS(pitSlot) - 0.9);
  });

  it('跳ね型は偶奇の合わない穴のトラップを無視する', () => {
    const w = bigWorld();
    const e = w.spawnEnemy(ENEMY_BY_ID.jumper, 0);
    const skip = e.jumpParity === 0 ? 1 : 0; // この敵が踏まない穴
    w.placeTrap(skip, 'spike');
    const hp = e.hp;
    for (let t = 0; t < 3 * 60; t++) w.update(1 / 60);
    expect(e.hp).toBe(hp);
  });

  it('空中投下は予告の後、塔の途中に敵が現れる', () => {
    const w = bigWorld();
    const drop = w.scheduleDrop();
    expect(w.pendingDrops).toContain(drop);
    const before = w.enemies.length;
    for (let t = 0; t < (AIRDROP.WARNING_TIME + 0.1) * 60; t++) w.update(1 / 60);
    expect(w.pendingDrops).not.toContain(drop);
    expect(w.enemies.length).toBeGreaterThanOrEqual(before + drop.defs.length);
    expect(w.enemies.some((e) => Math.abs(e.s - drop.s) < 0.5)).toBe(true);
  });
});

describe('M4: 神の妨害と天才', () => {
  function bigWorld(): World {
    const w = new World(7);
    w.debugAddFloors(30);
    w.drainEvents();
    w.points = 1e6;
    return w;
  }

  it('10階ごとに天才がやってくる', () => {
    const w = new World(1);
    w.debugAddFloors(25);
    expect(w.geniuses).toBe(GENIUS.START_COUNT + 2);
  });

  it('雷で停止したトラップは効果がなく、移動できず、撤去はできる', () => {
    const w = bigWorld();
    w.placeTrap(0, 'spike');
    w.triggerGod('lightning');
    const trap = w.getSlot(0)!.traps[0];
    expect(trap.disabled).toBe(true);
    expect(w.getSlot(0)!.effect.dps).toBe(0);
    expect(w.moveTrap(0, 0, 1)).toBe('invalid');
    expect(w.removeTrap(0, 0)).toBe('ok');
  });

  it('技術封印中のトラップは置けず、天才で再発明できる', () => {
    const w = bigWorld();
    w.triggerGod('seal');
    const seal = w.godEffects.find((g) => g.kind === 'seal')!;
    const def = TRAP_BY_ID[seal.trapId!];
    expect(w.canPlace(0, def)).toBe('sealed');
    w.geniuses = 1;
    expect(w.useGenius({ type: 'trap', defId: def.id })).toBe('ok');
    expect(w.isSealed(def)).toBe(false);
    expect(w.geniuses).toBe(0);
  });

  it('作業停止中は塔が伸びず、天才を作業員に使うと再開する', () => {
    const w = bigWorld();
    w.triggerGod('strike');
    expect(w.buildRate()).toBe(0);
    w.geniuses = 2;
    expect(w.useGenius({ type: 'workers' })).toBe('ok');
    expect(w.buildRate()).toBeGreaterThan(0);
    // 停止していなければ作業が速くなる
    const normal = w.buildRate();
    w.useGenius({ type: 'workers' });
    expect(w.buildRate()).toBeCloseTo(normal * GENIUS.WORKER_BUFF_MUL);
  });

  it('天才でトラップを強化すると、設置済みのトラップも強くなる', () => {
    const w = bigWorld();
    w.placeTrap(0, 'spike');
    const before = w.getSlot(0)!.effect.dps;
    w.geniuses = 1;
    w.useGenius({ type: 'trap', defId: 'spike' });
    expect(w.getSlot(0)!.effect.dps).toBeCloseTo(before * (1 + GENIUS.TRAP_UPGRADE_PER_LEVEL));
  });

  it('天才がいなければ使えない', () => {
    const w = bigWorld();
    w.geniuses = 0;
    expect(w.useGenius({ type: 'workers' })).toBe('noGenius');
  });

  it('妨害は最低 MIN_FLOOR_GAP 階あけて起きる', () => {
    const w = new World(3);
    const floors: number[] = [];
    for (let f = 0; f < 200; f++) {
      w.debugAddFloors(1);
      for (let t = 0; t < GOD.MAX_DELAY_SEC * 60 + 1; t++) w.update(1 / 60);
      const evs = w.drainEvents();
      if (evs.some((e) => e.type === 'lightning' || e.type === 'godStarted')) floors.push(w.floor);
      // 敵に負けないように作業員を回復しておく
      w.workers = w.workers.map(() => WORKERS.HP);
      w.enemies = [];
      if (w.workers.length === 0) break;
    }
    expect(floors.length).toBeGreaterThan(5);
    for (let i = 1; i < floors.length; i++) expect(floors[i] - floors[i - 1]).toBeGreaterThanOrEqual(GOD.MIN_FLOOR_GAP - 1);
  });
});

describe('M5: セーブ＆ロード', () => {
  /** 罠・敵・妨害がそろった、途中のゲーム */
  function midGame(): World {
    const w = new World(11);
    w.debugAddFloors(20);
    w.points = 5000;
    for (let i = 0; i < 30; i += 2) w.placeTrap(i, i % 4 === 0 ? 'spike' : 'poison');
    for (let t = 0; t < 60 * 60; t++) w.update(1 / 60);
    w.triggerGod('seal');
    w.triggerGod('language');
    w.drainEvents();
    return w;
  }

  it('通常ロードは、セーブ時点からまったく同じ続きになる', () => {
    const a = midGame();
    const snap = JSON.parse(JSON.stringify(a.toSnapshot()));
    const b = World.fromSnapshot(snap);
    for (let t = 0; t < 30 * 60; t++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    expect(JSON.stringify(b.toSnapshot())).toBe(JSON.stringify(a.toSnapshot()));
  });

  it('設備リセット: トラップがポイントに戻り、敵が坂道に並び、妨害は取り返しになる', () => {
    const a = midGame();
    const snap = JSON.parse(JSON.stringify(a.toSnapshot()));
    let refund = 0;
    for (const slot of a.slots.values()) for (const tr of slot.traps) refund += tr.def.cost;
    const b = World.facilityReset(snap);
    expect(b.slots.size).toBe(0);
    expect(b.points).toBeCloseTo(a.points + refund * SAVE.RESET_REFUND_RATIO, 0);
    expect(b.top).toBeCloseTo(a.top);
    expect(b.workers.length).toBe(a.workers.length);
    expect(b.godEffects.length).toBe(0);
    expect(b.bonusGods).toBe(a.godEffects.length);
    expect(b.enemies.length).toBeGreaterThan(20);
    expect(Math.max(...b.enemies.map((e) => e.s))).toBeLessThanOrEqual(b.workerS - SAVE.RESET_SAFE_FLOORS + 1e-9);
    // 1階進むごとに取り返しの妨害が起きる
    b.debugAddFloors(1);
    const evs = b.drainEvents();
    expect(evs.some((e) => e.type === 'godStarted' || e.type === 'lightning')).toBe(true);
    expect(b.bonusGods).toBe(a.godEffects.length - 1);
  });
});

describe('トラップの発動間隔', () => {
  it('ダメージ系は間隔ごとに、範囲内で頂上に近い敵から TRAP_TARGETS 体だけを攻撃する', () => {
    const w = new World(1);
    w.points = 1000;
    w.placeTrap(1, 'spike');
    const pos = slotS(1);
    // 範囲内に3体並べる（頂上に近い順に front, mid, back）
    const back = w.spawnEnemy(ENEMIES[0], pos - 0.02);
    const mid = w.spawnEnemy(ENEMIES[0], pos);
    const front = w.spawnEnemy(ENEMIES[0], pos + 0.02);
    for (const e of [back, mid, front]) {
      e.hp = e.maxHp = 1e6;
      e.speed = 0; // 動かないようにして、範囲内に留める
    }
    w.update(1 / 60);
    const hit = [back, mid, front].filter((e) => e.hp < 1e6);
    expect(hit.length).toBe(TRAP_TARGETS);
    expect(front.hp).toBeCloseTo(1e6 - TRAP_BY_ID.spike.dps! * TRAP_INTERVAL.damage);
    // 間隔が来るまでは次の攻撃をしない
    const after = front.hp;
    w.update(1 / 60);
    expect(front.hp).toBe(after);
  });

  it('遅延系は間隔なしで、範囲内の全員を減速させる', () => {
    const w = new World(1);
    w.points = 1000;
    w.placeTrap(1, 'glue');
    const pos = slotS(1);
    const a = w.spawnEnemy(ENEMIES[0], pos - 0.02);
    const b = w.spawnEnemy(ENEMIES[0], pos + 0.02);
    w.update(1 / 60);
    expect(a.currentSlow).toBeGreaterThan(0);
    expect(b.currentSlow).toBeGreaterThan(0);
  });
});
