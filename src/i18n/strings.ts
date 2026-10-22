/**
 * ============================================================
 *  画面に出す文字列
 * ============================================================
 * UIの文字はすべてここを通して表示します。
 *   t(キー)       … 辞書の文字列
 *   tn(文字列)    … トラップ名など、辞書の外の文字列
 *   num(数値)     … 数値（所持ポイント・コストなど）
 *
 * 神の妨害「言語混乱」が起きている間は、ここで文字や数値を変換して表示を乱す。
 *   言語 … 文字を、ギリシャ・キリル・アルメニア・ジョージア文字などに置き換える（文字列ごとに別の「言語」になる）
 *   数値 … 数値を、数秒ごとに変わるでたらめな値で表示する（内部の値は正しいまま）
 */

const JA = {
  reached: '到達',
  floorUnit: 'F',
  godTitle: '神の妨害',
  godNone: '— 静寂 —',
  workers: '作業員',
  genius: '天才',
  overview: '俯瞰',
  overviewOff: '戻る',
  toTop: '頂上へ',
  paused: '一時停止',
  resume: '再開',
  bgm: 'BGM',
  se: '効果音',
  restart: '最初から',
  gameOverTitle: '塔は呪いに呑まれた',
  reachedFloor: '到達階数',
  best: '最高記録',
  newRecord: '新記録！',
  retry: 'もう一度',
  remove: '撤去',
  move: '移動',
  slotTitle: 'この穴のトラップ',
  moveHint: '移動先の穴をタップ',
  moveCanceled: '移動をやめた',
  doubleTapHint: 'ダブルタップで撤去・移動',
  selectHint: '空いている穴をタップで設置（カードをもう一度タップで解除）',
  invented: '発明！',
  lockedAt: '{n}Fで発明',
  workerDied: '作業員が倒れた！ 残り{n}人',
  workerAdded: '作業員が加わった',
  synergy_damage_damage: 'シナジー：ダメージ強化・範囲拡大',
  synergy_delay_delay: 'シナジー：遅延が弱まりにくい',
  synergy_status_status: 'シナジー：状態異常が強く・長く',
  synergy_status_damage: 'シナジー：毒のダメージ増加',
  forced_knockback: '押し戻し！',
  forced_drop: '落下！',
  evaded: '見切った',
  dropWarning: '空中投下！',
  dropWarningBig: '巨人が降ってくる！',
  category_damage: 'ダメージ',
  category_delay: '遅延',
  category_status: '状態異常',
  category_force: '強制移動',
  reason_ok: '',
  reason_notEnough: '資材が足りない',
  reason_full: 'この穴は満杯（最大2つ）',
  reason_notBuilt: 'まだ建設中の場所',
  reason_locked: 'まだ発明されていない',
  reason_max: '作業員はこれ以上増やせない',
  reason_invalid: 'その操作はできない',
  reason_gameOver: '',
  reason_sealed: '技術封印されている',
  reason_noGenius: '天才がいない',
  reason_noTarget: 'そこには使えない',
  god_language: '言語混乱',
  god_numbers: '数値改変',
  god_strike: '作業停止',
  god_seal: '封印',
  godStart_lightning: '神の雷！ {n}基のトラップが停止した',
  godStart_language: '神の言語混乱！ 言葉が乱れた',
  godStart_numbers: '神の言語混乱！ 数字が狂った',
  godStart_strike: '神の言語混乱！ 作業員の手が止まった',
  godStart_seal: '神の技術封印！ {name}が作れなくなった',
  godEnd_genius: '天才が解決した：{name}',
  godEnd_time: '{name}がおさまった',
  godInfo_language: 'UIの言葉が乱れている。\n天才をここへドラッグで統一',
  godInfo_numbers: '一部の数値の表示が狂っている。\n天才をここへドラッグで修正',
  godInfo_strike: '作業員の手が止まっている（あと{n}秒）。\n天才をここか作業員へドラッグで再開',
  godInfo_seal: '{name}が製造できない。\n天才をここかカードへドラッグで再発明',
  geniusLabel: '天才',
  addWorker: '＋作業員',
  load: 'ロード',
  loadTitle: 'ロード',
  loadHelp: '続きから：その時点をそのまま再開\n設備リセット：トラップを全て資材に戻し、敵の満ちた塔で建て直す\n（消えた神の妨害は、1階進むごとに1つずつ追加で起きる）',
  loadNone: 'セーブがない（10階ごとに自動でセーブ）',
  loadNormal: '続きから',
  loadReset: '設備リセット',
  saved: '{n}F 到達！ セーブした',
  saveFailed: '{n}F 到達！（セーブに失敗）',
  loadedNormal: '{n}Fから再開',
  loadedReset: '{n}Fから設備リセット（◆{p}）',
  loadedResetGods: '取り返しの妨害があと{n}回',
  geniusArrived: '天才が現れた！（{n}人）',
  geniusHint: '天才をドラッグして使う\n妨害欄／作業員／トラップ',
  geniusNone: '天才がいない（10階ごとに現れる）',
  geniusWorkerBuff: '天才の指揮で作業が速くなった（{n}秒）',
  geniusUpgrade: '技術促進！ {name}が強化された（★{n}）',
  disabledTag: '停止中（雷）',
  sealedTag: '封印',
  workersStopped: '作業停止中',
};

export type StrKey = keyof typeof JA;

/** キーから文字列を取り出す。{n} などは vars で置き換える。言語混乱中は乱れた文字になる */
export function t(key: StrKey, vars?: Record<string, string | number>): string {
  let s: string = JA[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return tn(s);
}

// ------------------------------------------------------------
//  言語混乱
// ------------------------------------------------------------

const confusion = { language: false, numbers: false };
let version = 0;

/** 言語混乱の状態を設定する（変わったときだけ textVersion が増える） */
export function setConfusion(language: boolean, numbers: boolean): void {
  if (confusion.language === language && confusion.numbers === numbers) return;
  confusion.language = language;
  confusion.numbers = numbers;
  version++;
}

/** 言語混乱の状態が変わるたびに増える番号。UIはこれを見て文字を書き直す */
export function textVersion(): number {
  return version;
}

/**
 * 置き換え先の文字（＝「別の言語」）。文字列ごとにどれか1つが選ばれる。
 * 端末のフォントで表示できる文字を選んでいる
 */
const SCRIPTS = [
  'αβγδεζηθικλμνξοπρστυφχψωΔΘΛΞΠΣΦΨΩ', // ギリシャ文字
  'абвгдежзийклмнопрстуфхцчшщыэюяБГДЖЗИЛПФЦЧШЩЭЮЯ', // キリル文字
  'աբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆ', // アルメニア文字
  'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ', // ジョージア文字
];

/** 置き換えずに残す文字（数字・記号・空白など。意味は読めないが形は保つ） */
const KEEP = /[0-9\s◆★!！?？:：()（）\/%+\-.,、。…・×≡▲—〜~]/;

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 文字列を「別の言語」のような文字に置き換える（同じ文字列は毎回同じ結果） */
function scramble(text: string): string {
  const script = SCRIPTS[hashString(text) % SCRIPTS.length];
  let out = '';
  for (const ch of text) {
    if (KEEP.test(ch)) {
      out += ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    out += script[(code * 31 + 7) % script.length];
  }
  return out;
}

/** 辞書の外の文字列（トラップ名・説明など）を表示するとき。言語混乱中は乱れた文字になる */
export function tn(text: string): string {
  return confusion.language ? scramble(text) : text;
}

/** 数値の表示が狂う間隔（ミリ秒） */
const NUMBER_SHUFFLE_MS = 2500;

/**
 * 数値を表示用の文字列にする。数値改変中はでたらめな値になる（内部の値は正しいまま）
 * @param salt 同じ値でも表示場所ごとに違うでたらめにするための番号
 */
export function num(n: number, salt = 0): string {
  if (!confusion.numbers) return String(n);
  const bucket = Math.floor(Date.now() / NUMBER_SHUFFLE_MS);
  const r = (hashString(`${salt}:${bucket}`) % 1000) / 1000;
  return String(Math.max(0, Math.round(n * (0.3 + r * 1.9) + r * 37)));
}
