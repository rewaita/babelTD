/**
 * ============================================================
 *  ゲーム世界のシミュレーション
 * ============================================================
 * 描画（Phaser）には一切依存しない、純粋なゲームロジックです。
 * 画面に見えているかどうかに関係なく、麓から頂上まで全部の敵とトラップを数値で動かしています。
 * （下層は「敵の集団」で覆われて描画されないだけで、トラップは効き続ける）
 *
 * 1フレームの流れ（step）:
 *   1. 建設  … 作業員の人数に応じて塔が伸びる
 *   2. 収入  … 時間でポイントが増える
 *   3. 出現  … 麓から敵が出てくる。空中投下は予告の後、塔の途中に降ってくる
 *   4. 侵攻  … 敵が坂道を登り、近くのトラップの効果を受ける
 *              （ダメージ・遅延・状態異常・強制移動。状態異常と強制移動は個体ごとに学習して効きが落ちる）
 *   5. 撃破  … 体力0の敵を取り除き、報酬を得る
 *   6. 攻撃  … 作業員に追いついた敵が作業員を攻撃する
 *   7. 神    … 神の妨害の発生と時間経過（config/god.ts）
 *
 * 天才は10階ごとに1人増え、useGenius() で使う。
 *
 * セーブ＆ロード: toSnapshot() で状態を保存用のデータにし、
 * World.fromSnapshot()（通常ロード）/ World.facilityReset()（設備リセット）で復元する。
 */
import { AIRDROP, ENEMY_SCALING, FORCE, POINTS, SAVE, SIM, SLOW, SPAWN, STATUS, TOWER, WORKERS } from '../config/balance';
import { ENEMIES, ENEMY_BY_ID, type EnemyDef } from '../config/enemies';
import { TRAPS, TRAP_BY_ID, type ForceKind, type TrapDef } from '../config/traps';
import { GENIUS, GOD, type GodKind } from '../config/god';
import { slotIndexRange, slotS as wallSlotS } from './geometry';
import { createRng, randInt, type Rng } from './rng';
import { computeSlotEffect, emptyEffect, maxEffectRange } from './slotEffect';
import {
  WORKER_SLOT_IDS,
  WORKER_SLOT_LEFT,
  WORKER_SLOT_RIGHT,
  type ActionResult,
  type Enemy,
  type GeniusTarget,
  type GodEffect,
  type PendingDrop,
  type Slot,
  type StatusEffect,
  type SlotId,
  type WorldEvent,
} from './types';

/** セーブデータの形式のバージョン（形式を変えたら上げる。違うセーブは読み込まない） */
export const SNAPSHOT_VERSION = 1;

/** セーブ用の World の状態（JSONにできる値だけ） */
export interface WorldSnapshot {
  version: number;
  time: number;
  top: number;
  points: number;
  workers: number[];
  workersAdded: number;
  slots: { id: SlotId; traps: { defId: string; disabled?: boolean }[] }[];
  enemies: (Omit<Enemy, 'def'> & { defId: string })[];
  pendingDrops: { id: number; s: number; defIds: string[]; timeLeft: number; big: boolean }[];
  kills: number;
  geniuses: number;
  godEffects: GodEffect[];
  trapLevel: Record<string, number>;
  workerBuffTime: number;
  bonusGods: number;
  spawnTimer: number;
  dropTimer: number;
  floorsSinceGod: number;
  godTimer: number | null;
  nextUid: number;
  rngState: number;
}

/** 敵1体が受けるトラップ効果の集計用（毎回オブジェクトを作らないよう使い回す） */
interface EffectAccumulator {
  dps: number;
  slow: number;
  decayMul: number;
  /** 判定済みの強制移動の穴の範囲内にまだいるか */
  insideForce: boolean;
  /** このステップで受ける強制移動（最後にまとめて適用する） */
  force: { kind: ForceKind; distance: number } | null;
}

export class World {
  /** 経過時間（ゲーム内秒） */
  time = 0;
  /** 塔の高さ（階、小数あり）。これがスコアの元になる */
  top: number = TOWER.START_FLOORS;
  /** 所持ポイント */
  points: number = POINTS.START;
  /** 作業員それぞれの残り体力。先頭の人から攻撃を受ける */
  workers: number[] = [];
  /** これまでに追加した作業員の数（追加コストの計算用） */
  workersAdded = 0;
  /** トラップの入っている穴（空の穴は登録しない） */
  readonly slots = new Map<SlotId, Slot>();
  /** 生きている敵すべて（麓から頂上まで） */
  enemies: Enemy[] = [];
  /** 予告中の空中投下 */
  pendingDrops: PendingDrop[] = [];
  /** 撃破数 */
  kills = 0;
  /** 天才の人数（使える残り） */
  geniuses: number = GENIUS.START_COUNT;
  /** 続いている神の妨害 */
  godEffects: GodEffect[] = [];
  /** トラップの種類ごとの強化レベル（天才の技術促進） */
  readonly trapLevel: Record<string, number> = {};
  /** 天才による作業加速の残り秒数 */
  workerBuffTime = 0;
  /** 設備リセットで消えた妨害の数。この数だけ、1階進むごとに追加で妨害が起きる */
  bonusGods = 0;
  gameOver = false;

  private events: WorldEvent[] = [];
  private spawnTimer: number = SPAWN.FIRST_DELAY;
  private dropTimer: number = AIRDROP.BASE_INTERVAL;
  /** 前回の妨害から何階進んだか */
  private floorsSinceGod = 0;
  /** 次の妨害が起きるまでの秒数（予定がなければ null） */
  private godTimer: number | null = null;
  private accumulator = 0;
  private nextUid = 1;
  private readonly rng: Rng;
  private readonly maxRange = maxEffectRange();
  private readonly acc: EffectAccumulator = { dps: 0, slow: 0, decayMul: 1, insideForce: false, force: null };

  constructor(seed: number = Date.now()) {
    this.rng = createRng(seed);
    for (let i = 0; i < WORKERS.START_COUNT; i++) this.workers.push(WORKERS.HP);
  }

  // ------------------------------------------------------------
  //  参照用の値
  // ------------------------------------------------------------

  /** 到達階数（＝スコア）。1階目にいる間は1 */
  get floor(): number {
    return Math.floor(this.top) + 1;
  }

  /** 作業員の立ち位置（坂道上の位置） */
  get workerS(): number {
    return this.top - WORKERS.POSITION_BEHIND_TOP;
  }

  /** 「敵の集団」の上端（これより下は描画しない） */
  get hordeTop(): number {
    return Math.max(0, this.top - TOWER.HORDE_DEPTH_FLOORS);
  }

  /** 今の建設速度（階/秒） */
  buildRate(): number {
    const n = this.workers.length;
    if (n <= 0 || this.workersStopped) return 0;
    const buff = this.workerBuffTime > 0 ? GENIUS.WORKER_BUFF_MUL : 1;
    return (1 / WORKERS.SECONDS_PER_FLOOR) * Math.pow(n / WORKERS.BASE_COUNT, WORKERS.SPEED_EXPONENT) * buff;
  }

  /** 神の妨害（作業停止）で作業員の手が止まっているか */
  get workersStopped(): boolean {
    return this.godEffects.some((g) => g.kind === 'strike');
  }

  /** そのトラップは技術封印で製造できないか */
  isSealed(def: TrapDef): boolean {
    return this.godEffects.some((g) => g.kind === 'seal' && g.trapId === def.id);
  }

  /** トラップの種類ごとの強化倍率（天才の技術促進） */
  powerMul(def: TrapDef): number {
    return 1 + GENIUS.TRAP_UPGRADE_PER_LEVEL * (this.trapLevel[def.id] ?? 0);
  }

  /** その種類の妨害が続いているか */
  hasGod(kind: GodEffect['kind']): boolean {
    return this.godEffects.some((g) => g.kind === kind);
  }

  /** 毎秒の収入 */
  incomeRate(): number {
    return POINTS.PER_SECOND + POINTS.PER_SECOND_PER_FLOOR * this.floor;
  }

  /** 穴の坂道上の位置（作業員の横の穴は作業員と一緒に動く） */
  slotS(id: SlotId): number {
    if (id === WORKER_SLOT_LEFT) return this.workerS - WORKERS.SIDE_SLOT_OFFSET_LEFT;
    if (id === WORKER_SLOT_RIGHT) return this.workerS + WORKERS.SIDE_SLOT_OFFSET_RIGHT;
    return wallSlotS(id);
  }

  /** その穴はもう完成していて使えるか */
  isSlotBuilt(id: SlotId): boolean {
    if (id < 0) return true;
    return wallSlotS(id) <= this.top - TOWER.SLOT_BUILD_MARGIN;
  }

  /** そのトラップはもう発明されているか */
  isUnlocked(def: TrapDef): boolean {
    return this.floor >= def.unlockFloor;
  }

  /** 撤去・移動のコスト */
  removeCost(def: TrapDef): number {
    return Math.ceil(def.cost * POINTS.REMOVE_COST_RATIO);
  }

  /** 次の作業員を追加するコスト */
  addWorkerCost(): number {
    return Math.round(WORKERS.ADD_COST_BASE * Math.pow(WORKERS.ADD_COST_GROWTH, this.workersAdded));
  }

  getSlot(id: SlotId): Slot | undefined {
    return this.slots.get(id);
  }

  // ------------------------------------------------------------
  //  プレイヤーの操作
  // ------------------------------------------------------------

  /** トラップを置けるか調べる（置きはしない） */
  canPlace(id: SlotId, def: TrapDef): ActionResult {
    if (this.gameOver) return 'gameOver';
    if (!this.isUnlocked(def)) return 'locked';
    if (this.isSealed(def)) return 'sealed';
    if (!this.isSlotBuilt(id)) return 'notBuilt';
    const slot = this.slots.get(id);
    if (slot && slot.traps.length >= TOWER.TRAPS_PER_SLOT) return 'full';
    if (this.points < def.cost) return 'notEnough';
    return 'ok';
  }

  /** トラップを設置する */
  placeTrap(id: SlotId, defId: string): ActionResult {
    const def = TRAP_BY_ID[defId];
    if (!def) return 'invalid';
    const result = this.canPlace(id, def);
    if (result !== 'ok') return result;
    this.points -= def.cost;
    this.addTrapToSlot(id, def);
    return 'ok';
  }

  /** トラップを撤去する（設置コストの半分を払う。払い戻しは無し） */
  removeTrap(id: SlotId, index: number): ActionResult {
    if (this.gameOver) return 'gameOver';
    const slot = this.slots.get(id);
    const trap = slot?.traps[index];
    if (!slot || !trap) return 'invalid';
    const cost = this.removeCost(trap.def);
    if (this.points < cost) return 'notEnough';
    this.points -= cost;
    slot.traps.splice(index, 1);
    this.refreshSlot(slot);
    return 'ok';
  }

  /** トラップを別の穴へ移動する（設置コストの半分を払う） */
  moveTrap(fromId: SlotId, index: number, toId: SlotId): ActionResult {
    if (this.gameOver) return 'gameOver';
    if (fromId === toId) return 'invalid';
    const from = this.slots.get(fromId);
    const trap = from?.traps[index];
    if (!from || !trap || trap.disabled) return 'invalid'; // 雷で停止したトラップは撤去しかできない
    if (!this.isSlotBuilt(toId)) return 'notBuilt';
    const to = this.slots.get(toId);
    if (to && to.traps.length >= TOWER.TRAPS_PER_SLOT) return 'full';
    const cost = this.removeCost(trap.def);
    if (this.points < cost) return 'notEnough';
    this.points -= cost;
    from.traps.splice(index, 1);
    this.refreshSlot(from);
    this.addTrapToSlot(toId, trap.def);
    return 'ok';
  }

  /** 作業員を1人追加する */
  addWorker(): ActionResult {
    if (this.gameOver) return 'gameOver';
    if (this.workers.length >= WORKERS.MAX_COUNT) return 'max';
    const cost = this.addWorkerCost();
    if (this.points < cost) return 'notEnough';
    this.points -= cost;
    this.workersAdded++;
    this.workers.push(WORKERS.HP);
    return 'ok';
  }

  /** デバッグ用: 塔をすぐに n 階伸ばす */
  debugAddFloors(n: number): void {
    const prevFloor = this.floor;
    this.top += n;
    for (let f = prevFloor + 1; f <= this.floor; f++) this.onFloorReached(f);
  }

  /** シミュレーションで起きた出来事を取り出す（取り出すと空になる） */
  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------
  //  時間を進める
  // ------------------------------------------------------------

  /** dt 秒だけ時間を進める（内部では 1/60 秒刻みで計算する） */
  update(dt: number): void {
    if (this.gameOver) return;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= SIM.FIXED_STEP) {
      this.step(SIM.FIXED_STEP);
      this.accumulator -= SIM.FIXED_STEP;
      if (this.gameOver || ++steps >= SIM.MAX_STEPS_PER_FRAME) {
        this.accumulator = 0;
        break;
      }
    }
  }

  private step(dt: number): void {
    this.time += dt;

    // 1. 建設
    const prevFloor = this.floor;
    this.top += this.buildRate() * dt;
    for (let f = prevFloor + 1; f <= this.floor; f++) this.onFloorReached(f);

    // 2. 収入
    this.points += this.incomeRate() * dt;

    // 3. 出現
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer += this.nextSpawnInterval();
    }
    this.updateAirdrops(dt);

    // 4. 侵攻（とトラップの効果）
    let attackDps = 0;
    for (const e of this.enemies) {
      this.updateEnemy(e, dt);
      if (e.attacking && e.hp > 0) attackDps += e.attack;
    }

    // 5. 撃破
    if (this.enemies.some((e) => e.hp <= 0)) {
      const alive: Enemy[] = [];
      for (const e of this.enemies) {
        if (e.hp > 0) {
          alive.push(e);
        } else {
          this.points += e.reward;
          this.kills++;
          this.events.push({ type: 'enemyKilled', s: e.s, reward: e.reward, color: e.def.color });
        }
      }
      this.enemies = alive;
    }

    // 6. 作業員への攻撃
    if (attackDps > 0) this.damageWorkers(attackDps * dt);

    // 7. 神の妨害
    this.updateGod(dt);
  }

  private updateEnemy(e: Enemy, dt: number): void {
    // 周りの穴から受ける効果を集計
    const acc = this.acc;
    acc.dps = 0;
    acc.slow = 0;
    acc.decayMul = 1;
    acc.insideForce = false;
    acc.force = null;
    const [first, last] = slotIndexRange(e.s - this.maxRange, e.s + this.maxRange);
    for (let i = Math.max(0, first); i <= last; i++) {
      // 跳ね型は一個飛ばしで穴を踏むので、偶奇が合わない穴は無視する
      if (e.jumpParity >= 0 && (i & 1) !== e.jumpParity) continue;
      const slot = this.slots.get(i);
      if (slot) this.applySlot(e, slot, wallSlotS(i), 1);
    }
    // 作業員の横の穴: 作業員が攻撃される場所を中心に、広めの範囲で効く
    const defendCenter = this.workerS - WORKERS.SIDE_SLOT_DEFEND_CENTER;
    for (const id of WORKER_SLOT_IDS) {
      const slot = this.slots.get(id);
      if (slot) this.applySlot(e, slot, defendCenter, WORKERS.SIDE_SLOT_RANGE_MUL);
    }
    // 強制移動の穴の範囲を出たら、次に踏んだときにまた判定する
    if (!acc.insideForce) e.forceSlot = null;

    // 状態異常の経過（毒のダメージ・脆化の倍率）
    let dot = 0;
    let damageMul = 1;
    for (const kind of ['poison', 'weaken'] as const) {
      const st = e.statuses[kind];
      if (!st) continue;
      st.time -= dt;
      if (st.time <= 0) {
        delete e.statuses[kind];
        continue;
      }
      if (kind === 'poison') dot += st.power;
      else damageMul += st.power;
    }

    // 遅延の減衰: 連続して受けるほど効果が弱まる
    if (acc.slow > 0) {
      e.slowExposure += dt;
      e.slowIdle = 0;
    } else {
      e.slowIdle += dt;
      if (e.slowIdle >= SLOW.RESET_TIME) e.slowExposure = 0;
    }
    const slow =
      acc.slow > 0
        ? Math.min(SLOW.MAX_SLOW, acc.slow * Math.exp(-e.slowExposure / (SLOW.DECAY_TIME * acc.decayMul)))
        : 0;
    e.currentSlow = slow;
    e.hurt = acc.dps > 0 || dot > 0;
    e.hp -= (acc.dps + dot) * damageMul * dt;

    // 強制移動（押し戻し・落下）
    // （applySlot の中で書き換わるので、型の絞り込みを外して読み直す）
    const force = acc.force as EffectAccumulator['force'];
    if (force) {
      e.s = Math.max(0, e.s - force.distance);
      e.attacking = false;
      this.events.push({ type: 'forced', s: e.s, kind: force.kind, uid: e.uid });
      return;
    }

    // 移動: 作業員の少し手前まで進む（追いついたら攻撃開始）
    const limit =
      this.workerS - ENEMY_SCALING.ATTACK_GAP - (e.uid % 5) * ENEMY_SCALING.ATTACK_STAGGER;
    const next = e.s + e.speed * (1 - slow) * dt;
    e.s = Math.min(next, Math.max(e.s, limit));
    e.attacking = e.s >= limit - 1e-6;
  }

  /** 1つの穴の効果を敵に与える */
  private applySlot(e: Enemy, slot: Slot, slotPos: number, rangeMul: number): void {
    if (slot.traps.length === 0) return;
    const eff = slot.effect;
    const d = Math.abs(e.s - slotPos);
    if (d > eff.maxRange * rangeMul) return;
    let active = false;

    if (eff.dps > 0 && d <= eff.dmgRange * rangeMul) {
      this.acc.dps += eff.dps;
      active = true;
    }
    if (eff.slow > 0 && d <= eff.slowRange * rangeMul) {
      this.acc.slow = Math.max(this.acc.slow, eff.slow);
      this.acc.decayMul = Math.max(this.acc.decayMul, eff.slowDecayMul);
      active = true;
    }
    if (!e.def.statusImmune) {
      for (const st of eff.statuses) {
        if (d <= st.range * rangeMul) {
          this.applyStatus(e, st, slot.id);
          active = true;
        }
      }
    }
    if (eff.force && d <= eff.force.range * rangeMul) {
      if (e.forceSlot === slot.id) {
        this.acc.insideForce = true; // 判定済み。範囲を出るまで何もしない
      } else if (e.forceSlot === null && !this.acc.force) {
        e.forceSlot = slot.id;
        this.acc.insideForce = true;
        if (this.tryForce(e, eff.force.kind)) this.acc.force = { kind: eff.force.kind, distance: eff.force.distance };
        active = true;
      }
    }
    if (active) slot.activeUntil = this.time + 0.15;
  }

  /**
   * 状態異常をかける。
   * 別の穴で新しくかかるたびに「回数」が増え、回数に応じて強さが弱まる（学習）。
   * 同じ穴の範囲にいる間は、持続時間を延ばすだけ。
   */
  private applyStatus(e: Enemy, st: StatusEffect, slotId: SlotId): void {
    const kind = st.kind;
    const cur = e.statuses[kind];
    if (e.statusLastSlot[kind] === slotId) {
      if (cur) cur.time = Math.max(cur.time, st.duration);
      return;
    }
    e.statusLastSlot[kind] = slotId;
    const n = e.statusCount[kind] ?? 0;
    e.statusCount[kind] = n + 1;
    const power = st.power * Math.max(STATUS.MIN_RATIO, Math.pow(STATUS.DECAY_PER_APPLY, n));
    if (!cur || cur.power <= power) e.statuses[kind] = { power, time: st.duration };
    else cur.time = Math.max(cur.time, st.duration);
  }

  /**
   * 強制移動を受けるか判定する（学習: 受けた回数が多いほど見切って回避する）
   * @returns 受けたら true、回避したら false
   */
  private tryForce(e: Enemy, kind: ForceKind): boolean {
    const n = e.forceCount[kind] ?? 0;
    const evadeChance = 1 - Math.pow(FORCE.KEEP[kind], n);
    if (this.rng() < evadeChance) {
      this.events.push({ type: 'evaded', s: e.s, kind });
      return false;
    }
    e.forceCount[kind] = n + 1;
    return true;
  }

  private damageWorkers(amount: number): void {
    let left = amount;
    while (left > 0 && this.workers.length > 0) {
      this.workers[0] -= left;
      if (this.workers[0] <= 0) {
        left = -this.workers[0];
        this.workers.shift();
        this.events.push({ type: 'workerDied', remaining: this.workers.length });
      } else {
        left = 0;
      }
    }
    if (this.workers.length === 0 && !this.gameOver) {
      this.gameOver = true;
      this.events.push({ type: 'gameOver', floor: this.floor });
    }
  }

  private onFloorReached(floor: number): void {
    this.events.push({ type: 'floorReached', floor });
    // 天才がやってくる
    if (floor % GENIUS.EVERY_FLOORS === 0) {
      this.geniuses++;
      this.events.push({ type: 'geniusArrived', count: this.geniuses });
    }
    // 設備リセットで消えた妨害の「取り返し」: 1階ごとに1つ追加で起きる
    if (this.bonusGods > 0) {
      this.bonusGods--;
      this.triggerGod();
    }
    // 神の妨害を予定する（最低 MIN_FLOOR_GAP 階あけて、確率で）
    if (floor >= GOD.START_FLOOR) {
      this.floorsSinceGod++;
      if (this.godTimer === null && this.floorsSinceGod >= GOD.MIN_FLOOR_GAP && this.rng() < GOD.CHANCE_PER_FLOOR) {
        this.godTimer = this.rng() * GOD.MAX_DELAY_SEC;
        this.floorsSinceGod = 0;
      }
    }
    for (const def of TRAPS) {
      if (def.unlockFloor === floor) this.events.push({ type: 'trapInvented', def });
    }
  }

  // ------------------------------------------------------------
  //  敵の出現
  // ------------------------------------------------------------

  private nextSpawnInterval(): number {
    const base = Math.max(
      SPAWN.MIN_INTERVAL,
      SPAWN.BASE_INTERVAL * Math.pow(SPAWN.INTERVAL_MUL_PER_FLOOR, this.floor),
    );
    return base * (1 + (this.rng() * 2 - 1) * SPAWN.INTERVAL_JITTER);
  }

  private spawnWave(): void {
    const def = this.pickEnemyDef();
    const count = this.rng() < SPAWN.GROUP_CHANCE ? randInt(this.rng, SPAWN.GROUP_MIN, SPAWN.GROUP_MAX) : 1;
    for (let k = 0; k < count; k++) this.spawnEnemy(def, -k * SPAWN.GROUP_SPACING);
  }

  private pickEnemyDef(): EnemyDef {
    const candidates = ENEMIES.filter((d) => !d.dropOnly && d.weight > 0 && this.floor >= d.minFloor);
    const total = candidates.reduce((sum, d) => sum + d.weight, 0);
    let r = this.rng() * total;
    for (const d of candidates) {
      r -= d.weight;
      if (r <= 0) return d;
    }
    return candidates[candidates.length - 1];
  }

  /** 敵を1体出現させる（s: 出現位置。通常は麓 = 0） */
  spawnEnemy(def: EnemyDef, s = 0): Enemy {
    const f = this.floor;
    const hp = def.hp * Math.pow(ENEMY_SCALING.HP_MUL_PER_FLOOR, f);
    const enemy: Enemy = {
      uid: this.nextUid++,
      def,
      s,
      hp,
      maxHp: hp,
      speed: def.speed * (1 + ENEMY_SCALING.SPEED_ADD_PER_FLOOR * f),
      attack: def.attack * Math.pow(ENEMY_SCALING.ATTACK_MUL_PER_FLOOR, f),
      reward: Math.round(def.reward * (1 + ENEMY_SCALING.REWARD_ADD_PER_FLOOR * f)),
      level: f,
      jumpParity: def.jump ? (this.rng() < 0.5 ? 0 : 1) : -1,
      slowExposure: 0,
      slowIdle: 0,
      currentSlow: 0,
      statuses: {},
      statusCount: {},
      statusLastSlot: {},
      forceCount: {},
      forceSlot: null,
      hurt: false,
      attacking: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  // ------------------------------------------------------------
  //  神の妨害
  // ------------------------------------------------------------

  private updateGod(dt: number): void {
    if (this.godTimer !== null) {
      this.godTimer -= dt;
      if (this.godTimer <= 0) {
        this.godTimer = null;
        this.triggerGod();
      }
    }
    if (this.workerBuffTime > 0) this.workerBuffTime = Math.max(0, this.workerBuffTime - dt);
    // 時間で終わる妨害
    for (const g of this.godEffects) {
      if (g.timeLeft === null) continue;
      g.timeLeft -= dt;
      if (g.timeLeft <= 0) this.endGod(g, false);
    }
  }

  /** 今起こせる妨害の種類（同じ妨害の重複や、対象がない妨害は除く） */
  private availableGodKinds(): GodKind[] {
    const kinds: GodKind[] = [];
    if (this.collectLightningCandidates().length > 0) kinds.push('lightning');
    for (const k of ['language', 'numbers', 'strike'] as const) if (!this.hasGod(k)) kinds.push(k);
    if (this.sealCandidates().length > 0) kinds.push('seal');
    return kinds;
  }

  /** 神の妨害を起こす（kind を省略すると重みに従ってランダム） */
  triggerGod(kind?: GodKind): GodKind | null {
    const kinds = this.availableGodKinds();
    if (kinds.length === 0) return null;
    if (!kind || !kinds.includes(kind)) {
      const total = kinds.reduce((sum, k) => sum + GOD.WEIGHTS[k], 0);
      let r = this.rng() * total;
      kind = kinds[kinds.length - 1];
      for (const k of kinds) {
        r -= GOD.WEIGHTS[k];
        if (r <= 0) {
          kind = k;
          break;
        }
      }
    }

    if (kind === 'lightning') {
      this.strikeLightning();
      return kind;
    }
    const duration = GOD.DURATION[kind];
    const effect: GodEffect = { id: this.nextUid++, kind, timeLeft: duration > 0 ? duration : null };
    if (kind === 'seal') {
      const cands = this.sealCandidates();
      effect.trapId = this.pickWeighted(cands.map((c) => ({ item: c.def.id, weight: c.weight })));
    }
    this.godEffects.push(effect);
    this.events.push({ type: 'godStarted', effect });
    return kind;
  }

  private endGod(effect: GodEffect, byGenius: boolean): void {
    this.godEffects = this.godEffects.filter((g) => g !== effect);
    this.events.push({ type: 'godEnded', effect, byGenius });
  }

  /** 雷の対象になりうるトラップ（停止していないもの）と、狙われやすさ */
  private collectLightningCandidates(): { slot: Slot; index: number; weight: number }[] {
    const hidden = this.hordeTop;
    const list: { slot: Slot; index: number; weight: number }[] = [];
    for (const slot of this.slots.values()) {
      const weight = slot.id >= 0 && wallSlotS(slot.id) < hidden ? GOD.LIGHTNING.HIDDEN_WEIGHT : 1;
      if (weight <= 0) continue;
      slot.traps.forEach((trap, index) => {
        if (!trap.disabled) list.push({ slot, index, weight });
      });
    }
    return list;
  }

  /** 雷: いくつかのトラップを停止させる */
  private strikeLightning(): void {
    let cands = this.collectLightningCandidates();
    const n = Math.floor(GOD.LIGHTNING.BASE_TARGETS + this.floor * GOD.LIGHTNING.TARGETS_PER_FLOOR);
    const targets: { slotId: SlotId; s: number }[] = [];
    for (let i = 0; i < n && cands.length > 0; i++) {
      const pick = this.pickWeighted(cands.map((c) => ({ item: c, weight: c.weight })));
      pick.slot.traps[pick.index].disabled = true;
      this.refreshSlot(pick.slot);
      targets.push({ slotId: pick.slot.id, s: this.slotS(pick.slot.id) });
      cands = cands.filter((c) => c !== pick);
    }
    this.events.push({ type: 'lightning', targets });
  }

  /** 技術封印の対象になりうるトラップの種類（発明済み・未封印）。設置数が多いほど狙われやすい */
  private sealCandidates(): { def: TrapDef; weight: number }[] {
    const placed: Record<string, number> = {};
    for (const slot of this.slots.values()) for (const t of slot.traps) placed[t.def.id] = (placed[t.def.id] ?? 0) + 1;
    return TRAPS.filter((d) => this.isUnlocked(d) && !this.isSealed(d)).map((def) => ({ def, weight: 1 + (placed[def.id] ?? 0) }));
  }

  private pickWeighted<T>(list: { item: T; weight: number }[]): T {
    const total = list.reduce((sum, x) => sum + x.weight, 0);
    let r = this.rng() * total;
    for (const x of list) {
      r -= x.weight;
      if (r <= 0) return x.item;
    }
    return list[list.length - 1].item;
  }

  // ------------------------------------------------------------
  //  天才
  // ------------------------------------------------------------

  /** 天才を使う。成功すると天才が1人減る */
  useGenius(target: GeniusTarget): ActionResult {
    if (this.gameOver) return 'gameOver';
    if (this.geniuses <= 0) return 'noGenius';
    let result: 'resolved' | 'workerBuff' | 'upgrade';

    if (target.type === 'god') {
      // 妨害を解決（言語混乱の統一・再発明・作業再開）
      const effect = this.godEffects.find((g) => g.id === target.id);
      if (!effect) return 'noTarget';
      this.endGod(effect, true);
      result = 'resolved';
    } else if (target.type === 'workers') {
      // 作業停止中なら再開、そうでなければ作業を早める
      const strike = this.godEffects.find((g) => g.kind === 'strike');
      if (strike) {
        this.endGod(strike, true);
        result = 'resolved';
      } else {
        if (this.workers.length === 0) return 'noTarget';
        this.workerBuffTime = GENIUS.WORKER_BUFF_SEC;
        result = 'workerBuff';
      }
    } else {
      const def = TRAP_BY_ID[target.defId];
      if (!def || !this.isUnlocked(def)) return 'noTarget';
      const seal = this.godEffects.find((g) => g.kind === 'seal' && g.trapId === def.id);
      if (seal) {
        // 封印中なら再発明
        this.endGod(seal, true);
        result = 'resolved';
      } else {
        // 技術促進: その種類のトラップをすべて強化
        this.trapLevel[def.id] = (this.trapLevel[def.id] ?? 0) + 1;
        for (const slot of this.slots.values()) {
          if (slot.traps.some((t) => t.def.id === def.id)) this.refreshSlot(slot);
        }
        result = 'upgrade';
      }
    }
    this.geniuses--;
    this.events.push({ type: 'geniusUsed', target, result });
    return 'ok';
  }

  // ------------------------------------------------------------
  //  空中投下
  // ------------------------------------------------------------

  private updateAirdrops(dt: number): void {
    if (this.floor >= AIRDROP.MIN_FLOOR) {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) {
        this.scheduleDrop();
        this.dropTimer += Math.max(
          AIRDROP.MIN_INTERVAL,
          AIRDROP.BASE_INTERVAL * Math.pow(AIRDROP.INTERVAL_MUL_PER_FLOOR, this.floor - AIRDROP.MIN_FLOOR),
        );
      }
    }
    if (this.pendingDrops.length === 0) return;
    for (const drop of this.pendingDrops) {
      drop.timeLeft -= dt;
      if (drop.timeLeft <= 0) {
        drop.defs.forEach((def, k) => this.spawnEnemy(def, Math.max(0, drop.s - k * AIRDROP.GROUP_SPACING)));
        this.events.push({ type: 'dropLanded', drop });
      }
    }
    this.pendingDrops = this.pendingDrops.filter((d) => d.timeLeft > 0);
  }

  /** 空中投下を予告する（WARNING_TIME 秒後に降ってくる） */
  scheduleDrop(): PendingDrop {
    const depth = AIRDROP.MIN_DEPTH + this.rng() * (AIRDROP.MAX_DEPTH - AIRDROP.MIN_DEPTH);
    const big = this.rng() >= AIRDROP.GROUP_CHANCE;
    const defs = big
      ? [ENEMY_BY_ID[AIRDROP.BIG_ENEMY]]
      : Array.from({ length: randInt(this.rng, AIRDROP.GROUP_MIN, AIRDROP.GROUP_MAX) }, () => ENEMY_BY_ID[AIRDROP.GROUP_ENEMY]);
    const drop: PendingDrop = {
      id: this.nextUid++,
      s: Math.max(0.3, this.top - depth),
      defs,
      timeLeft: AIRDROP.WARNING_TIME,
      big,
    };
    this.pendingDrops.push(drop);
    this.events.push({ type: 'dropWarning', drop });
    return drop;
  }

  // ------------------------------------------------------------
  //  セーブ＆ロード
  // ------------------------------------------------------------

  /** 今の状態をセーブ用のデータにする */
  toSnapshot(): WorldSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      time: this.time,
      top: this.top,
      points: this.points,
      workers: [...this.workers],
      workersAdded: this.workersAdded,
      slots: [...this.slots.values()].map((slot) => ({
        id: slot.id,
        traps: slot.traps.map((t) => (t.disabled ? { defId: t.def.id, disabled: true } : { defId: t.def.id })),
      })),
      enemies: this.enemies.map(({ def, ...rest }) => structuredClone({ ...rest, defId: def.id })),
      pendingDrops: this.pendingDrops.map((d) => ({ id: d.id, s: d.s, defIds: d.defs.map((x) => x.id), timeLeft: d.timeLeft, big: d.big })),
      kills: this.kills,
      geniuses: this.geniuses,
      godEffects: this.godEffects.map((g) => ({ ...g })),
      trapLevel: { ...this.trapLevel },
      workerBuffTime: this.workerBuffTime,
      bonusGods: this.bonusGods,
      spawnTimer: this.spawnTimer,
      dropTimer: this.dropTimer,
      floorsSinceGod: this.floorsSinceGod,
      godTimer: this.godTimer,
      nextUid: this.nextUid,
      rngState: this.rng.getState(),
    };
  }

  /** 通常ロード: セーブした時点の状態をそのまま復元する */
  static fromSnapshot(snap: WorldSnapshot): World {
    const w = new World(0);
    w.time = snap.time;
    w.top = snap.top;
    w.points = snap.points;
    w.workers = [...snap.workers];
    w.workersAdded = snap.workersAdded;
    for (const [k, v] of Object.entries(snap.trapLevel)) w.trapLevel[k] = v;
    for (const slot of snap.slots) {
      for (const t of slot.traps) {
        const def = TRAP_BY_ID[t.defId];
        if (!def) continue;
        w.addTrapToSlot(slot.id, def);
        if (t.disabled) {
          const s = w.slots.get(slot.id)!;
          s.traps[s.traps.length - 1].disabled = true;
          w.refreshSlot(s);
        }
      }
    }
    w.enemies = snap.enemies
      .filter((e) => ENEMY_BY_ID[e.defId])
      .map(({ defId, ...rest }) => ({ ...structuredClone(rest), def: ENEMY_BY_ID[defId] }));
    w.pendingDrops = snap.pendingDrops.map((d) => ({
      id: d.id,
      s: d.s,
      defs: d.defIds.map((id) => ENEMY_BY_ID[id]).filter(Boolean),
      timeLeft: d.timeLeft,
      big: d.big,
    }));
    w.kills = snap.kills;
    w.geniuses = snap.geniuses;
    w.godEffects = snap.godEffects.map((g) => ({ ...g }));
    w.workerBuffTime = snap.workerBuffTime;
    w.bonusGods = snap.bonusGods;
    w.spawnTimer = snap.spawnTimer;
    w.dropTimer = snap.dropTimer;
    w.floorsSinceGod = snap.floorsSinceGod;
    w.godTimer = snap.godTimer;
    w.nextUid = snap.nextUid;
    w.rng.setState(snap.rngState);
    return w;
  }

  /**
   * 設備リセット:
   *   塔の高さ・作業員・天才・技術促進はそのまま
   *   トラップはすべて撤去して、設置コスト × RESET_REFUND_RATIO をポイントに戻す
   *   敵はその階数相当の強さ・密度で、坂道全体に並んだ状態から始まる（頂上付近は少しあける）
   *   続いていた神の妨害は消えるが、消えた数だけ「1階進むごとに追加の妨害」が起きる
   */
  static facilityReset(snap: WorldSnapshot): World {
    const w = World.fromSnapshot(snap);
    let refund = 0;
    for (const slot of w.slots.values()) for (const t of slot.traps) refund += t.def.cost;
    w.points += Math.floor(refund * SAVE.RESET_REFUND_RATIO);
    w.slots.clear();

    w.bonusGods += w.godEffects.length;
    w.godEffects = [];
    w.godTimer = null;
    w.workerBuffTime = 0;
    w.pendingDrops = [];
    w.enemies = [];
    w.fillEnemiesAlongPath();
    w.events = [];
    return w;
  }

  /**
   * 今の階数で敵が出続けていた場合の並び方で、坂道全体に敵を置く（設備リセット用）
   * 頂上から RESET_SAFE_FLOORS 階の範囲は空けておく
   */
  private fillEnemiesAlongPath(): void {
    const interval = Math.max(SPAWN.MIN_INTERVAL, SPAWN.BASE_INTERVAL * Math.pow(SPAWN.INTERVAL_MUL_PER_FLOOR, this.floor));
    let s = this.workerS - SAVE.RESET_SAFE_FLOORS;
    while (s > 0) {
      const def = this.pickEnemyDef();
      const e = this.spawnEnemy(def, s);
      // 1回の出現間隔のあいだにその敵が進む距離だけ、次の敵を後ろに置く
      s -= e.speed * interval;
    }
  }

  // ------------------------------------------------------------
  //  内部処理
  // ------------------------------------------------------------

  private addTrapToSlot(id: SlotId, def: TrapDef): void {
    let slot = this.slots.get(id);
    if (!slot) {
      slot = { id, traps: [], effect: emptyEffect(), activeUntil: 0 };
      this.slots.set(id, slot);
    }
    slot.traps.push({ uid: this.nextUid++, def });
    this.refreshSlot(slot);
  }

  private refreshSlot(slot: Slot): void {
    if (slot.traps.length === 0) {
      this.slots.delete(slot.id);
      return;
    }
    slot.effect = computeSlotEffect(slot.traps, (def) => this.powerMul(def));
  }
}
