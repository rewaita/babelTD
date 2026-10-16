/**
 * ============================================================
 *  BGM（自動生成）
 * ============================================================
 * 音声ファイルを使わず、WebAudio でその場で曲を鳴らし続ける。
 * 塔が高くなるほど（intensity）激しく、神の妨害中（tension）は不協和音が混ざる。
 *
 * 曲の材料（下の定数で調整できる）:
 *   ドローン … 低い持続音（根音と5度）。フィルターがゆっくり開閉する
 *   和音     … 4小節ごとに変わるコード進行
 *   鐘       … 音階からランダムに選んだ音。高くなるほど多く鳴る
 *   鼓動     … 低い打音。高くなるほど速くなる
 *   不協和   … 妨害中だけ鳴る、半音ずれた音
 *
 * 本番のBGMファイルに差し替えるときは、このファイルの start() で
 * Phaser の this.sound.play('bgm', { loop: true }) を使う形に置き換える。
 */
import { audioContext } from './context';

/** テンポ（1分あたりの拍数） */
const BPM = 76;
/** 根音（Hz）。D2 */
const ROOT = 73.42;
/** 鐘に使う音階（根音からの半音数。Dのエオリアン） */
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
/** コード進行（根音からの半音数の組）。1コード = 4小節 */
const CHORDS = [
  [0, 3, 7], // Dm
  [-2, 2, 5], // B♭
  [-5, -2, 2], // Gm
  [-3, 1, 4], // A
];
/** 全体の音量の基準（設定の音量に掛ける） */
const MASTER = 0.22;
/** 先読みして予約する秒数と、予約処理の間隔（ミリ秒） */
const LOOKAHEAD = 0.25;
const TICK_MS = 50;

const semitone = (n: number) => ROOT * Math.pow(2, n / 12);

class BgmPlayer {
  private master: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private dissonance: GainNode | null = null;
  private echo: DelayNode | null = null;
  /** 次に予約する16分音符の番号と、その時刻 */
  private step = 0;
  private nextTime = 0;
  private volume = 0.6;
  private intensity = 0;
  private tension = false;
  private ducked = false;

  /** 音を鳴らし始める（AudioContext が使えるようになってから呼ぶ。2回目以降は何もしない） */
  start(): void {
    const ctx = audioContext();
    if (!ctx || this.master) return;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // エコー（鐘用）
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = (60 / BPM) * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    this.echo.connect(feedback).connect(this.echo);
    this.echo.connect(this.master);

    // ドローン: 根音と5度のノコギリ波を、ゆっくり動くフィルターに通す
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.18;
    this.droneFilter.connect(droneGain).connect(this.master);
    for (const [ratio, detune] of [
      [1, -6],
      [1.5, 5],
      [0.5, 0],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = ROOT * ratio;
      osc.detune.value = detune;
      osc.connect(this.droneFilter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();

    // 不協和（妨害中だけ音量を上げる）: 半音上の音と三全音
    this.dissonance = ctx.createGain();
    this.dissonance.gain.value = 0;
    this.dissonance.connect(this.master);
    for (const n of [13, 18]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = semitone(n);
      const trem = ctx.createGain();
      trem.gain.value = 0.05;
      osc.connect(trem).connect(this.dissonance);
      osc.start();
    }

    this.nextTime = ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), TICK_MS);
    this.applyLevels();
  }

  /** 設定の音量（0〜1） */
  setVolume(v: number): void {
    this.volume = v;
    this.applyLevels();
  }

  /** 盛り上がり（0〜1）。塔の高さなどから決める */
  setIntensity(x: number): void {
    this.intensity = Math.max(0, Math.min(1, x));
    if (this.droneFilter && audioContext()) {
      this.droneFilter.frequency.setTargetAtTime(260 + 500 * this.intensity, audioContext()!.currentTime, 2);
    }
  }

  /** 神の妨害中か（不協和音を混ぜる） */
  setTension(on: boolean): void {
    if (this.tension === on) return;
    this.tension = on;
    this.applyLevels();
  }

  /** 一時停止中などに音量を下げる */
  setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyLevels();
  }

  private applyLevels(): void {
    const ctx = audioContext();
    if (!ctx || !this.master || !this.dissonance) return;
    const level = MASTER * this.volume * (this.ducked ? 0.35 : 1);
    this.master.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    this.dissonance.gain.setTargetAtTime(this.tension ? 1 : 0, ctx.currentTime, 1.5);
  }

  /** 先読みの範囲に入った音を予約する */
  private schedule(): void {
    const ctx = audioContext();
    if (!ctx || !this.master) return;
    const sixteenth = 60 / BPM / 4;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(ctx, this.step, this.nextTime);
      this.step++;
      this.nextTime += sixteenth;
    }
  }

  private playStep(ctx: AudioContext, step: number, t: number): void {
    const beat = 60 / BPM;
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chord = CHORDS[Math.floor(bar / 4) % CHORDS.length];

    // 和音: 小節の頭で鳴らし、1小節かけて減衰
    if (inBar === 0) {
      for (const n of chord) this.tone(ctx, semitone(n + 12), t, beat * 4, 'triangle', 0.05, 0.6, this.master!);
    }
    // 鼓動: 盛り上がるほど細かく
    const pulseEvery = this.intensity > 0.66 ? 4 : this.intensity > 0.33 ? 8 : 16;
    if (inBar % pulseEvery === 0) this.thump(ctx, t, 0.22 + 0.25 * this.intensity);
    // 鐘: 8分音符ごとに、盛り上がりに応じた確率で
    if (inBar % 2 === 0 && Math.random() < 0.12 + 0.4 * this.intensity) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)] + 24;
      this.tone(ctx, semitone(n), t, beat * 1.5, 'sine', 0.07, 0.005, this.echo!);
    }
  }

  /** 1音鳴らす（attack 秒かけて立ち上がり、dur 秒で消える） */
  private tone(ctx: AudioContext, freq: number, t: number, dur: number, type: OscillatorType, gain: number, attack: number, dest: AudioNode): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** 低い打音（音程が下がるサイン波） */
  private thump(ctx: AudioContext, t: number, gain: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

/** ゲーム全体で1つだけ使うBGMプレイヤー */
export const bgm = new BgmPlayer();
