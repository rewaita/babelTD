/**
 * 穴に入ったトラップ（最大2つ）から、合計の効果を計算する（シナジーもここで適用）
 */
import { SYNERGY, TRAPS, type TrapDef } from '../config/traps';
import { GENIUS } from '../config/god';
import type { PlacedTrap, SlotEffect, StatusEffect } from './types';

export function emptyEffect(): SlotEffect {
  return {
    dps: 0,
    dmgRange: 0,
    slow: 0,
    slowRange: 0,
    slowDecayMul: 1,
    statuses: [],
    force: null,
    synergies: [],
    maxRange: 0,
  };
}

/**
 * @param traps 穴に入っているトラップ
 * @param powerMul トラップの種類ごとの強化倍率（天才の技術促進）。省略時は 1
 */
export function computeSlotEffect(
  traps: readonly PlacedTrap[],
  powerMul: (def: TrapDef) => number = () => 1,
): SlotEffect {
  const eff = emptyEffect();
  const count = { damage: 0, delay: 0, status: 0, force: 0 };

  for (const { def, disabled } of traps) {
    if (disabled) continue; // 雷で停止中のトラップは効果なし（シナジーにも数えない）
    const mul = powerMul(def);
    count[def.category]++;
    switch (def.category) {
      case 'damage':
        eff.dps += (def.dps ?? 0) * mul;
        eff.dmgRange = Math.max(eff.dmgRange, def.range);
        break;
      case 'delay':
        // 遅延は足し算せず、強い方を使う
        eff.slow = Math.max(eff.slow, Math.min(GENIUS.SLOW_CAP, (def.slow ?? 0) * mul));
        eff.slowRange = Math.max(eff.slowRange, def.range);
        break;
      case 'status':
        if (def.status) {
          const power = def.status.power * mul;
          const same = eff.statuses.find((s) => s.kind === def.status!.kind);
          if (same) {
            // 同じ種類が2つなら強い方の値を使う（シナジーは下で別途かかる）
            same.power = Math.max(same.power, power);
            same.duration = Math.max(same.duration, def.status.duration);
            same.range = Math.max(same.range, def.range);
          } else {
            eff.statuses.push({ ...def.status, power, range: def.range } as StatusEffect);
          }
        }
        break;
      case 'force':
        if (def.force) {
          // 技術促進: 押し戻しは距離が伸びる（落とし穴は常にちょうど1周下）
          const distance = def.force.kind === 'knockback' ? def.force.distance * mul : def.force.distance;
          if (!eff.force || distance > eff.force.distance) eff.force = { kind: def.force.kind, distance, range: def.range };
        }
        break;
    }
  }

  // ダメージ＋ダメージ: ダメージと範囲が上がる
  if (count.damage >= 2) {
    eff.dps *= SYNERGY.DAMAGE_DAMAGE.DPS_MUL;
    eff.dmgRange *= SYNERGY.DAMAGE_DAMAGE.RANGE_MUL;
    eff.synergies.push('damage_damage');
  }
  // 遅延＋遅延: 減衰しにくくなる
  if (count.delay >= 2) {
    eff.slowDecayMul = SYNERGY.DELAY_DELAY.DECAY_TIME_MUL;
    eff.slow = Math.min(1, eff.slow + SYNERGY.DELAY_DELAY.SLOW_ADD);
    eff.synergies.push('delay_delay');
  }
  // 状態異常＋状態異常: 強く・長くなる
  if (count.status >= 2) {
    for (const s of eff.statuses) {
      s.power *= SYNERGY.STATUS_STATUS.POWER_MUL;
      s.duration *= SYNERGY.STATUS_STATUS.DURATION_MUL;
    }
    eff.synergies.push('status_status');
  }
  // 状態異常＋ダメージ: 毒のダメージが増える
  if (count.status >= 1 && count.damage >= 1) {
    for (const s of eff.statuses) if (s.kind === 'poison') s.power *= SYNERGY.STATUS_DAMAGE.DOT_MUL;
    eff.synergies.push('status_damage');
  }

  eff.maxRange = Math.max(eff.dmgRange, eff.slowRange, eff.force?.range ?? 0, ...eff.statuses.map((s) => s.range));
  return eff;
}

/** どのトラップの組み合わせでも届きうる最大の範囲（敵の周りの穴を探す範囲に使う） */
export function maxEffectRange(): number {
  const base = Math.max(...TRAPS.map((t) => t.range));
  return base * Math.max(1, SYNERGY.DAMAGE_DAMAGE.RANGE_MUL);
}
