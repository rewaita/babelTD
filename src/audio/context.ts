/**
 * 効果音と BGM で共有する、ブラウザの音の出口（AudioContext）
 * スマホのブラウザは、最初に画面をタップするまで音を鳴らせない。unlockAudio() で解除する。
 */
let ctx: AudioContext | null = null;

/** 最初のタップ時に呼ぶ。使えなければ null */
export function unlockAudio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** すでに使える状態なら AudioContext、まだなら null */
export function audioContext(): AudioContext | null {
  return ctx;
}
