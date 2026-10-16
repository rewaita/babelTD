/**
 * ============================================================
 *  効果音（仮）
 * ============================================================
 * 音声ファイルを使わず、ブラウザの WebAudio で簡単な電子音を鳴らしています。
 * PATTERNS の数値（周波数Hz・開始秒・長さ秒・波形・音量）を変えると音が変わります。
 * 本番の効果音ファイルに差し替えるときは、play() の中身を Phaser の this.sound.play() に置き換えます。
 *
 * ※ スマホのブラウザは、最初に画面をタップするまで音を鳴らせない（unlock で解除する）
 */
import { audioContext, unlockAudio } from './context';

export type SfxKind =
  | 'place'
  | 'remove'
  | 'kill'
  | 'hurt'
  | 'invent'
  | 'milestone'
  | 'deny'
  | 'worker'
  | 'gameOver'
  | 'warning'
  | 'land'
  | 'force'
  | 'evade'
  | 'thunder'
  | 'curse'
  | 'genius';

interface Note {
  freq: number;
  start: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

const PATTERNS: Record<SfxKind, Note[]> = {
  place: [
    { freq: 520, start: 0, dur: 0.07, type: 'square', gain: 0.18 },
    { freq: 780, start: 0.06, dur: 0.09, type: 'square', gain: 0.16 },
  ],
  remove: [{ freq: 300, start: 0, dur: 0.12, type: 'triangle', gain: 0.3 }],
  kill: [{ freq: 880, start: 0, dur: 0.05, type: 'triangle', gain: 0.18 }],
  hurt: [
    { freq: 140, start: 0, dur: 0.18, type: 'sawtooth', gain: 0.25 },
    { freq: 90, start: 0.12, dur: 0.25, type: 'sawtooth', gain: 0.25 },
  ],
  invent: [
    { freq: 523, start: 0, dur: 0.1, type: 'triangle', gain: 0.3 },
    { freq: 659, start: 0.1, dur: 0.1, type: 'triangle', gain: 0.3 },
    { freq: 784, start: 0.2, dur: 0.18, type: 'triangle', gain: 0.3 },
  ],
  milestone: [
    { freq: 392, start: 0, dur: 0.15, type: 'sine', gain: 0.35 },
    { freq: 588, start: 0.12, dur: 0.3, type: 'sine', gain: 0.3 },
  ],
  deny: [{ freq: 180, start: 0, dur: 0.1, type: 'square', gain: 0.15 }],
  worker: [
    { freq: 660, start: 0, dur: 0.06, type: 'square', gain: 0.15 },
    { freq: 990, start: 0.07, dur: 0.08, type: 'square', gain: 0.15 },
  ],
  warning: [
    { freq: 880, start: 0, dur: 0.12, type: 'square', gain: 0.18 },
    { freq: 660, start: 0.15, dur: 0.12, type: 'square', gain: 0.18 },
    { freq: 880, start: 0.3, dur: 0.12, type: 'square', gain: 0.18 },
  ],
  land: [
    { freq: 70, start: 0, dur: 0.35, type: 'sawtooth', gain: 0.35 },
    { freq: 45, start: 0.05, dur: 0.4, type: 'sine', gain: 0.4 },
  ],
  force: [{ freq: 420, start: 0, dur: 0.12, type: 'triangle', gain: 0.25 }],
  evade: [{ freq: 1200, start: 0, dur: 0.05, type: 'sine', gain: 0.12 }],
  thunder: [
    { freq: 60, start: 0, dur: 0.5, type: 'sawtooth', gain: 0.45 },
    { freq: 1800, start: 0, dur: 0.06, type: 'square', gain: 0.2 },
    { freq: 90, start: 0.08, dur: 0.6, type: 'square', gain: 0.25 },
  ],
  curse: [
    { freq: 220, start: 0, dur: 0.4, type: 'sawtooth', gain: 0.2 },
    { freq: 233, start: 0.05, dur: 0.4, type: 'sawtooth', gain: 0.2 },
    { freq: 147, start: 0.3, dur: 0.6, type: 'triangle', gain: 0.3 },
  ],
  genius: [
    { freq: 784, start: 0, dur: 0.12, type: 'sine', gain: 0.3 },
    { freq: 988, start: 0.1, dur: 0.12, type: 'sine', gain: 0.3 },
    { freq: 1319, start: 0.2, dur: 0.3, type: 'sine', gain: 0.3 },
  ],
  gameOver: [
    { freq: 330, start: 0, dur: 0.35, type: 'sawtooth', gain: 0.25 },
    { freq: 247, start: 0.3, dur: 0.4, type: 'sawtooth', gain: 0.25 },
    { freq: 165, start: 0.65, dur: 0.8, type: 'sawtooth', gain: 0.25 },
  ],
};

/** 同じ音を連続で鳴らすときの最短間隔（秒）。撃破音が鳴りすぎないように */
const MIN_INTERVAL = 0.06;

class SfxPlayer {
  /** 効果音の音量（0〜1） */
  volume = 0.7;
  private readonly lastPlayed: Partial<Record<SfxKind, number>> = {};

  /** 最初のタップ時に呼ぶ（スマホで音を出せるようにする） */
  unlock(): void {
    unlockAudio();
  }

  play(kind: SfxKind): void {
    const ctx = audioContext();
    if (!ctx || this.volume <= 0) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed[kind] ?? -1;
    if (now - last < MIN_INTERVAL) return;
    this.lastPlayed[kind] = now;

    for (const n of PATTERNS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      const t0 = now + n.start;
      const peak = n.gain * this.volume * 0.5;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.02);
    }
  }
}

/** ゲーム全体で1つだけ使う効果音プレイヤー */
export const sfx = new SfxPlayer();
