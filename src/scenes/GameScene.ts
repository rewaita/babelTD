/**
 * ============================================================
 *  ゲーム本編のシーン
 * ============================================================
 * シミュレーション（World）・描画（Renderer）・UI をつなぐ司令塔。
 *
 * 操作の振り分け:
 *   - 画面下部のカードをタップ     … トラップを選ぶ。選んだまま空きのある穴をタップすると設置（続けて何個でも）
 *   - 設置済みの穴をダブルタップ   … 撤去・移動の小窓
 *   - 作業員（＋作業員ラベル）をタップ … 作業員を追加
 *   - それ以外の塔の部分をスワイプ … カメラ移動（回転しながら上下）
 *   - マウスホイール（PC）          … カメラ移動
 *   - 天才ボタンからドラッグ        … 妨害欄の妨害／作業員／トラップ（穴かカード）に天才を使う
 *
 * セーブ: 10階ごとに自動。ロード: メニューかゲームオーバー画面から（シーンを作り直して復元する）
 */
import Phaser from 'phaser';
import { ANIM, CAMERA, DEPTH, TOWER_LOOK, VIEW } from '../config/visual';
import type { TrapDef } from '../config/traps';
import { World } from '../sim/World';
import type { ActionResult, SlotId } from '../sim/types';
import { TowerView } from '../render/TowerView';
import { TowerRenderer, type HoleInfo } from '../render/TowerRenderer';
import { EntityRenderer } from '../render/EntityRenderer';
import { Hud } from '../ui/Hud';
import { TrapBar } from '../ui/TrapBar';
import { Menu } from '../ui/Menu';
import { SlotPopup } from '../ui/SlotPopup';
import { GameOverPanel } from '../ui/GameOverPanel';
import { FloatingTexts, Toast } from '../ui/Feedback';
import { DropIndicator } from '../ui/DropIndicator';
import { LightningFx } from '../render/LightningFx';
import { Effects } from '../render/Effects';
import { GENIUS } from '../config/god';
import { TRAP_BY_ID } from '../config/traps';
import type { GeniusTarget, GodEffect } from '../sim/types';
import { UI } from '../ui/theme';
import { makeText } from '../ui/widgets';
import { sfx } from '../audio/Sfx';
import { bgm } from '../audio/Bgm';
import { loadBest, loadSettings, saveBest, saveSettings, type Settings } from '../settings';
import { setConfusion, t, tn, type StrKey } from '../i18n/strings';
import { DEBUG } from '../debug';
import { SAVE, TOWER } from '../config/balance';
import { listSaves, writeSave, type SaveEntry } from '../saves';
import { LoadDialog, resetPoints, type LoadMode } from '../ui/LoadDialog';

/** シーン開始時に渡すデータ（ロードするときだけ） */
export interface GameStartData {
  load?: { entry: SaveEntry; mode: LoadMode };
}

const TAU = Math.PI * 2;
/** BGMが最も激しくなる到達階数 */
const BGM_FULL_INTENSITY_FLOOR = 100;

export class GameScene extends Phaser.Scene {
  private world!: World;
  private view!: TowerView;
  private towerRenderer!: TowerRenderer;
  private entities!: EntityRenderer;
  private hud!: Hud;
  private trapBar!: TrapBar;
  private menu!: Menu;
  private popup!: SlotPopup;
  private gameOverPanel!: GameOverPanel;
  private loadDialog!: LoadDialog;
  private toast!: Toast;
  private floats!: FloatingTexts;
  private dropIndicator!: DropIndicator;
  private lightningFx!: LightningFx;
  private effects!: Effects;
  private settings!: Settings;
  private debugText: Phaser.GameObjects.Text | null = null;

  // ---- 状態（scene.restart() でも初期化されるよう create() で設定する） ----
  /** 一時停止中（メニュー表示中） */
  private paused = false;
  /** 俯瞰モード中 */
  private overview = false;
  /** カメラが頂上を追いかけているか */
  private follow = true;
  /** アニメーション用の時刻（一時停止中は止まる） */
  private animTime = 0;
  /** デバッグ用のゲーム速度倍率 */
  private debugSpeed = 1;
  /** カメラのスワイプ中の情報 */
  private camDrag: { startX: number; startY: number; startH: number; startA: number; moved: boolean } | null = null;
  /** 選んでいるトラップ（選んだまま穴をタップすると設置できる） */
  private selected: TrapDef | null = null;
  /** 天才をドラッグ中の情報（ghost は動かし始めてから作る） */
  private geniusDrag: { startX: number; startY: number; ghost: Phaser.GameObjects.Image | null } | null = null;
  /** トラップの移動先を選んでいる最中の情報 */
  private moving: { fromId: SlotId; index: number } | null = null;
  /** ダブルタップ判定用 */
  private lastTap: { time: number; id: SlotId } | null = null;

  constructor() {
    super('Game');
  }

  create(data: GameStartData = {}): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.paused = false;
    this.overview = false;
    this.follow = true;
    this.animTime = 0;
    this.debugSpeed = 1;
    this.camDrag = null;
    this.selected = null;
    this.moving = null;
    this.lastTap = null;
    this.geniusDrag = null;
    setConfusion(false, false);

    // ロードならセーブから復元、そうでなければ新しいゲーム
    const load = data.load;
    this.world = !load
      ? new World()
      : load.mode === 'normal'
        ? World.fromSnapshot(load.entry.data)
        : World.facilityReset(load.entry.data);
    this.view = new TowerView(w, h);
    this.view.camH = this.followTarget();
    this.view.camA = this.followAngle();
    this.view.zoom = this.view.targetZoom = CAMERA.NORMAL_ZOOM;

    this.towerRenderer = new TowerRenderer(this, this.view);
    this.entities = new EntityRenderer(this, this.view);
    this.floats = new FloatingTexts(this);
    this.dropIndicator = new DropIndicator(this, this.view);
    this.lightningFx = new LightningFx(this);
    this.effects = new Effects(this);
    this.toast = new Toast(this, w);

    this.settings = loadSettings();
    sfx.volume = this.settings.seVolume;
    bgm.setVolume(this.settings.bgmVolume);

    this.hud = new Hud(this, w, h, {
      onMenu: () => this.openMenu(),
      onOverview: () => this.toggleOverview(),
      onToTop: () => {
        this.follow = true;
      },
      onGeniusDown: (p) => this.startGeniusDrag(p),
      onGodChip: (effect) => this.toast.show(this.godInfo(effect), 3000, UI.TEXT_GOLD),
    });
    this.trapBar = new TrapBar(
      this,
      0,
      h - VIEW.BOTTOM_BAR_HEIGHT + 92,
      w,
      (def) => this.selectTrap(def),
    );
    this.popup = new SlotPopup(this, w, h);
    this.menu = new Menu(this, w, h, this.settings, {
      onResume: () => this.closeMenu(),
      onRestart: () => this.scene.restart({}),
      onLoad: () => this.openLoadDialog(),
      onSettingsChanged: (s) => {
        sfx.volume = s.seVolume;
        bgm.setVolume(s.bgmVolume);
        saveSettings(s);
      },
    });
    this.gameOverPanel = new GameOverPanel(
      this,
      w,
      h,
      () => this.scene.restart({}),
      () => this.openLoadDialog(),
    );
    this.loadDialog = new LoadDialog(this, w, h);

    this.setupInput();

    // ブラウザのタブを切り替えたら自動で一時停止
    const onHidden = () => {
      if (!this.world.gameOver) this.openMenu();
    };
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.input.removeAllListeners();
      this.input.keyboard?.removeAllListeners();
    });

    if (DEBUG) this.setupDebug();

    if (load) {
      const n = load.entry.floor;
      const msg =
        load.mode === 'normal'
          ? t('loadedNormal', { n })
          : `${t('loadedReset', { n, p: resetPoints(load.entry) })}${this.world.bonusGods > 0 ? `\n${t('loadedResetGods', { n: this.world.bonusGods })}` : ''}`;
      this.toast.show(msg, 3000, UI.TEXT_GOLD);
    }
  }

  update(_time: number, deltaMs: number): void {
    const dtReal = Math.min(deltaMs / 1000, 0.1);
    if (!this.paused && !this.world.gameOver) {
      const timeScale = (this.overview ? CAMERA.OVERVIEW_TIME_SCALE : 1) * this.debugSpeed;
      this.world.update(dtReal * timeScale);
      this.animTime += dtReal * timeScale;
    }
    this.handleWorldEvents();
    this.updateCamera(dtReal);

    const hidden = this.countHiddenEnemies();
    this.towerRenderer.draw(this.world, this.animTime, hidden);
    // トラップを選んでいる間は、置ける穴を光らせる
    const sel = this.selected;
    this.entities.placeable = sel ? (id) => this.world.canPlace(id, sel) === 'ok' : null;
    this.trapBar.setSelected(sel?.id ?? null);
    this.entities.draw(this.world, this.towerRenderer.holes, this.animTime);
    this.dropIndicator.draw(this.world, this.animTime);
    this.lightningFx.draw(this.animTime);
    this.effects.draw(this.animTime);
    // 言語混乱の状態を文字表示に反映（変わったときだけUIが書き直される）
    setConfusion(this.world.hasGod('language'), this.world.hasGod('numbers'));
    this.hud.update(this.world, { overview: this.overview, follow: this.follow });
    this.trapBar.refresh(this.world);

    // BGM: 高くなるほど激しく、妨害中は不協和音、メニュー中などは小さく
    bgm.setIntensity(this.world.floor / BGM_FULL_INTENSITY_FLOOR);
    bgm.setTension(this.world.godEffects.length > 0);
    bgm.setDucked(this.paused || this.world.gameOver || this.loadDialog.isOpen);

    if (this.debugText) {
      this.debugText.setText(
        [
          `fps ${Math.round(this.game.loop.actualFps)}  x${this.debugSpeed}`,
          `敵 ${this.world.enemies.length}（集団内 ${hidden}）  撃破 ${this.world.kills}`,
          `塔 ${this.world.top.toFixed(2)}階  建設 ${(1 / this.world.buildRate()).toFixed(1)}秒/階`,
          `時間 ${Math.floor(this.world.time)}秒`,
        ].join('\n'),
      );
    }
  }

  // ------------------------------------------------------------
  //  カメラ
  // ------------------------------------------------------------

  /** 頂上追従時にカメラが見る高さ */
  private followTarget(): number {
    return this.world.top - CAMERA.FOLLOW_OFFSET;
  }

  /** 頂上追従時にカメラが向く角度（作業員が正面に来る） */
  private followAngle(): number {
    return this.world.top - CAMERA.FOLLOW_ANGLE_OFFSET;
  }

  private updateCamera(dt: number): void {
    const v = this.view;
    const towerTop = VIEW.TOP_BAR_HEIGHT;
    const towerBottom = v.height - VIEW.BOTTOM_BAR_HEIGHT;

    // 俯瞰: 塔の頂上〜「敵の集団」の上端が画面に収まるズームとカメラ高さ（円錐の見た目込みで計算）
    let overviewCamH = 0;
    if (this.overview) {
      const m = CAMERA.OVERVIEW_MARGIN_FLOORS;
      const fit = v.fitRange(
        this.world.hordeTop - m,
        this.world.top + TOWER_LOOK.CAP_LIFT + m,
        towerTop,
        towerBottom,
        CAMERA.NORMAL_ZOOM,
        CAMERA.OVERVIEW_MIN_ZOOM,
      );
      v.targetZoom = fit.zoom;
      overviewCamH = fit.camH;
    } else {
      v.targetZoom = CAMERA.NORMAL_ZOOM;
    }
    v.zoom += (v.targetZoom - v.zoom) * Math.min(1, dt * CAMERA.ZOOM_LERP);

    const k = Math.min(1, dt * CAMERA.FOLLOW_LERP);
    if (this.overview) {
      v.camH += (overviewCamH - v.camH) * k;
      v.camA += (this.followAngle() - v.camA) * k;
    } else if (this.follow && !this.camDrag?.moved) {
      v.camH += (this.followTarget() - v.camH) * k;
      v.camA += (this.followAngle() - v.camA) * k;
    }
    this.clampCamera();
  }

  private clampCamera(): void {
    const v = this.view;
    if (this.overview) return;
    v.camH = Phaser.Math.Clamp(v.camH, this.world.hordeTop - 0.3, this.world.top + 0.3);
  }

  /** カメラを手動で動かす。dH: 高さ方向（階）、dA: 回転方向（階単位） */
  private moveCamera(dH: number, dA: number): void {
    const v = this.view;
    v.camH += dH + dA;
    v.camA += dH * CAMERA.VERTICAL_DRAG_ROTATION + dA;
    this.clampCamera();
    this.follow = false;
  }

  private toggleOverview(): void {
    this.overview = !this.overview;
    this.cancelGeniusDrag();
    this.popup.close();
    if (!this.overview) this.follow = true;
  }

  // ------------------------------------------------------------
  //  入力
  // ------------------------------------------------------------

  private setupInput(): void {
    const towerTop = VIEW.TOP_BAR_HEIGHT;
    const towerBottom = () => this.view.height - VIEW.BOTTOM_BAR_HEIGHT;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      sfx.unlock();
      if (over.length > 0) return; // ボタンなどUIの上
      if (this.isBlocked()) return;
      if (p.y < towerTop || p.y > towerBottom()) return;
      this.camDrag = { startX: p.x, startY: p.y, startH: this.view.camH, startA: this.view.camA, moved: false };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.geniusDrag) {
        this.updateGeniusDrag(p);
        return;
      }
      if (this.trapBar.handleMove(p)) return;
      const d = this.camDrag;
      if (!d || !p.isDown) return;
      const dx = p.x - d.startX;
      const dy = p.y - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > CAMERA.DRAG_THRESHOLD) d.moved = true;
      if (!d.moved) return;
      // 指の動きに塔がついてくるように動かす
      this.view.camH = d.startH;
      this.view.camA = d.startA;
      this.moveCamera(dy / this.view.localFloorPx(d.startH), -dx / (TAU * this.view.radiusAt(d.startH)));
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.trapBar.handleUp();
      if (this.geniusDrag) {
        this.finishGeniusDrag();
        return;
      }
      const d = this.camDrag;
      this.camDrag = null;
      if (!d) return;
      if (!d.moved) this.handleTap(p.x, p.y);
    });

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.isBlocked() || this.overview) return;
      this.moveCamera(-dy * CAMERA.WHEEL_FLOORS_PER_PIXEL, 0);
    });
  }

  /** メニューやゲームオーバー画面が出ていて、塔を操作できない状態か */
  private isBlocked(): boolean {
    return this.paused || this.world.gameOver || this.loadDialog.isOpen;
  }

  private handleTap(x: number, y: number): void {
    // 空中投下の吹き出し: タップでその地点へカメラを移動
    const dropS = this.dropIndicator.hit(x, y);
    if (dropS !== null && !this.overview) {
      this.follow = false;
      this.view.camH = dropS + CAMERA.FOLLOW_OFFSET * 0.5;
      this.view.camA = dropS;
      this.clampCamera();
      return;
    }

    const hole = this.towerRenderer.hitHole(x, y);

    // 移動先を選んでいる最中
    if (this.moving) {
      const from = this.moving;
      this.moving = null;
      this.entities.highlight = null;
      if (hole && hole.id !== from.fromId) {
        const res = this.world.moveTrap(from.fromId, from.index, hole.id);
        this.feedback(res, hole, 'place');
      } else {
        this.toast.show(t('moveCanceled'));
      }
      return;
    }

    // トラップを選んでいて、空きのある穴をタップしたら設置（選んだままなので続けて置ける）
    if (hole && this.selected && (this.world.getSlot(hole.id)?.traps.length ?? 0) < TOWER.TRAPS_PER_SLOT) {
      const res = this.world.placeTrap(hole.id, this.selected.id);
      this.feedback(res, hole, 'place', this.selected.cost);
      return;
    }

    if (hole) {
      const slot = this.world.getSlot(hole.id);
      if (!slot) return;
      const now = this.time.now;
      if (this.lastTap && this.lastTap.id === hole.id && now - this.lastTap.time < ANIM.DOUBLE_TAP_MS) {
        this.lastTap = null;
        this.openSlotPopup(hole);
      } else {
        this.lastTap = { time: now, id: hole.id };
        this.toast.show(t('doubleTapHint'), 1000, UI.TEXT_SUB);
      }
      return;
    }

    if (this.entities.hitWorkers(x, y)) {
      const cost = this.world.addWorkerCost();
      const res = this.world.addWorker();
      if (res === 'ok') {
        sfx.play('worker');
        this.toast.show(t('workerAdded'), 1000, UI.TEXT_GOOD);
        const c = this.entities.workersCenter;
        if (c) this.floats.spawn(c.x, c.y - 30, `-${cost}`, UI.TEXT_DANGER);
      } else {
        this.denied(res);
      }
    }
  }

  // ---- トラップの選択（タップで選び、穴をタップで設置） ----

  /** カードをタップした: そのトラップを選ぶ（選んでいるカードなら解除） */
  private selectTrap(def: TrapDef): void {
    if (this.isBlocked()) return;
    if (this.selected === def) {
      this.selected = null;
      this.toast.hide();
      return;
    }
    const info = `${tn(def.name)}（${t(`category_${def.category}` as StrKey)}）\n${tn(def.description)}`;
    if (!this.world.isUnlocked(def)) {
      this.toast.show(`${t('lockedAt', { n: def.unlockFloor })}\n${info}`, 2200, UI.TEXT_SUB);
      return;
    }
    if (this.world.isSealed(def)) return this.denied('sealed');
    this.popup.close();
    this.moving = null;
    this.entities.highlight = null;
    this.selected = def;
    this.toast.show(`${info}\n${t('selectHint')}`, 2600, UI.TEXT_GOLD);
  }

  // ---- 天才（ドラッグして使う） ----

  private startGeniusDrag(p: Phaser.Input.Pointer): void {
    if (this.isBlocked()) return;
    if (this.world.geniuses <= 0) {
      sfx.play('deny');
      this.toast.show(t('geniusNone'), 1500, UI.TEXT_DANGER);
      return;
    }
    this.popup.close();
    this.moving = null;
    this.geniusDrag = { startX: p.x, startY: p.y, ghost: null };
  }

  private updateGeniusDrag(p: Phaser.Input.Pointer): void {
    const d = this.geniusDrag!;
    if (!d.ghost) {
      if (Math.hypot(p.x - d.startX, p.y - d.startY) < CAMERA.DRAG_THRESHOLD) return;
      d.ghost = this.add.image(p.x, p.y, 'genius').setDepth(DEPTH.GHOST).setScale(1.1);
    }
    d.ghost.setPosition(p.x, p.y - ANIM.PLACE_GHOST_OFFSET_Y);
    this.setGeniusHighlight(this.geniusTargetAt(d.ghost.x, d.ghost.y));
  }

  private finishGeniusDrag(): void {
    const d = this.geniusDrag!;
    this.geniusDrag = null;
    if (!d.ghost) {
      // ドラッグせずに離した: 使い方の案内
      this.toast.show(t('geniusHint'), 2200, UI.TEXT_GOLD);
      return;
    }
    const hit = this.geniusTargetAt(d.ghost.x, d.ghost.y);
    d.ghost.destroy();
    this.setGeniusHighlight(null);
    if (!hit) return;
    const res = this.world.useGenius(hit.target);
    if (res !== 'ok') this.denied(res);
  }

  private cancelGeniusDrag(): void {
    this.geniusDrag?.ghost?.destroy();
    this.geniusDrag = null;
    this.setGeniusHighlight(null);
  }

  /** 画面上の位置にある、天才を使える対象 */
  private geniusTargetAt(
    x: number,
    y: number,
  ): { target: GeniusTarget; chipId?: number; cardId?: string; workers?: boolean; holeId?: SlotId } | null {
    const chip = this.hud.godPanel.hitChip(x, y);
    if (chip) return { target: { type: 'god', id: chip.id }, chipId: chip.id };
    const card = this.trapBar.hitCard(x, y);
    if (card && this.world.isUnlocked(card)) return { target: { type: 'trap', defId: card.id }, cardId: card.id };
    if (this.entities.hitWorkers(x, y)) return { target: { type: 'workers' }, workers: true };
    const hole = this.towerRenderer.nearestHole(x, y, ANIM.HOLE_SNAP_RADIUS);
    const slot = hole ? this.world.getSlot(hole.id) : undefined;
    if (hole && slot && slot.traps.length > 0) {
      // 2つ入っている穴は、左右どちらに近いかで対象を選ぶ
      const index = slot.traps.length === 2 && x > hole.x ? 1 : 0;
      return { target: { type: 'trap', defId: slot.traps[index].def.id }, holeId: hole.id };
    }
    return null;
  }

  private setGeniusHighlight(hit: ReturnType<GameScene['geniusTargetAt']>): void {
    this.hud.godPanel.setHighlight(hit?.chipId ?? null);
    this.trapBar.setHighlight(hit?.cardId ?? null);
    this.entities.workersHighlight = !!hit?.workers;
    this.entities.highlight = hit?.holeId !== undefined ? { id: hit.holeId, mode: 'ok' } : null;
  }

  // ---- 神の妨害の表示用 ----

  /** 封印されたトラップの名前（封印以外は空） */
  private sealName(effect: GodEffect): string {
    return effect.trapId ? tn(TRAP_BY_ID[effect.trapId]?.name ?? '') : '';
  }

  /** 妨害の名前（封印はトラップ名つき） */
  private godName(effect: GodEffect): string {
    return effect.kind === 'seal' ? `${t('god_seal')}：${this.sealName(effect)}` : t(`god_${effect.kind}`);
  }

  /** 妨害欄のチップをタップしたときの説明 */
  private godInfo(effect: GodEffect): string {
    return t(`godInfo_${effect.kind}`, { n: Math.ceil(effect.timeLeft ?? 0), name: this.sealName(effect) });
  }

  // ---- 撤去・移動 ----

  private openSlotPopup(hole: HoleInfo): void {
    const slot = this.world.getSlot(hole.id);
    if (!slot) return;
    const id = hole.id;
    this.popup.open(
      hole,
      slot,
      (def) => this.world.removeCost(def),
      (index) => {
        const trap = this.world.getSlot(id)?.traps[index];
        const res = this.world.removeTrap(id, index);
        const h = this.towerRenderer.findHole(id);
        this.feedback(res, h, 'remove', trap ? this.world.removeCost(trap.def) : 0);
      },
      (index) => {
        const trap = this.world.getSlot(id)?.traps[index];
        if (!trap) return;
        if (this.world.points < this.world.removeCost(trap.def)) return this.denied('notEnough');
        this.moving = { fromId: id, index };
        this.entities.highlight = { id, mode: 'source' };
        this.toast.show(t('moveHint'), 2500, UI.TEXT_GOLD);
      },
    );
  }

  // ---- 結果の表示 ----

  private feedback(res: ActionResult, hole: HoleInfo | undefined, kind: 'place' | 'remove', cost = 0): void {
    if (res !== 'ok') return this.denied(res);
    sfx.play(kind);
    if (hole && cost > 0) this.floats.spawn(hole.x, hole.y - 30, `-${cost}`, UI.TEXT_DANGER);
  }

  private denied(res: ActionResult): void {
    sfx.play('deny');
    const msg = t(`reason_${res}` as StrKey);
    if (msg) this.toast.show(msg, 1200, UI.TEXT_DANGER);
  }

  // ------------------------------------------------------------
  //  シミュレーションの出来事
  // ------------------------------------------------------------

  private handleWorldEvents(): void {
    for (const ev of this.world.drainEvents()) {
      switch (ev.type) {
        case 'enemyKilled': {
          // 画面に見えている場所での撃破だけ演出する
          const p = this.visibleEnemyPos(ev.s);
          if (p) {
            this.effects.puff(p.x, p.y + 10, ev.color, this.view.zoom * this.view.scaleAt(ev.s), this.animTime);
            this.floats.spawn(p.x, p.y, `+${ev.reward}`);
            sfx.play('kill');
          }
          break;
        }
        case 'workerDied':
          this.cameras.main.shake(220, 0.006);
          this.toast.show(t('workerDied', { n: ev.remaining }), ANIM.TOAST_MS, UI.TEXT_DANGER);
          sfx.play('hurt');
          break;
        case 'floorReached':
          if (ev.floor % SAVE.EVERY_FLOORS === 0) {
            // 自動セーブ
            const ok = writeSave(ev.floor, this.world.toSnapshot());
            this.toast.show(t(ok ? 'saved' : 'saveFailed', { n: ev.floor }), ANIM.TOAST_MS, ok ? UI.TEXT_GOLD : UI.TEXT_DANGER);
            sfx.play('milestone');
          }
          break;
        case 'forced':
        case 'evaded': {
          const p = this.visibleEnemyPos(ev.s);
          if (!p) break;
          if (ev.type === 'forced') {
            this.floats.spawn(p.x, p.y - 30, t(`forced_${ev.kind}`), '#8fd3ff', 22);
            sfx.play('force');
          } else {
            this.floats.spawn(p.x, p.y - 30, t('evaded'), '#c8c0d8', 20);
            sfx.play('evade');
          }
          break;
        }
        case 'dropWarning':
          this.toast.show(ev.drop.big ? t('dropWarningBig') : t('dropWarning'), 1500, UI.TEXT_DANGER);
          sfx.play('warning');
          break;
        case 'dropLanded':
          this.dropIndicator.onLanded(ev.drop, this.animTime);
          if (this.visibleEnemyPos(ev.drop.s)) this.cameras.main.shake(180, 0.004);
          sfx.play('land');
          break;
        case 'lightning': {
          if (ev.targets.length === 0) break;
          for (const target of ev.targets) {
            const hole = this.towerRenderer.findHole(target.slotId);
            if (hole) this.lightningFx.strike(hole.x, hole.y, this.animTime);
          }
          this.cameras.main.flash(220, 255, 250, 210);
          this.toast.show(t('godStart_lightning', { n: ev.targets.length }), 2600, UI.TEXT_DANGER);
          sfx.play('thunder');
          break;
        }
        case 'godStarted':
          this.cameras.main.shake(300, 0.004);
          this.toast.show(t(`godStart_${ev.effect.kind}`, { name: this.sealName(ev.effect) }), 2600, UI.TEXT_DANGER);
          sfx.play('curse');
          break;
        case 'godEnded': {
          const name = this.godName(ev.effect);
          this.toast.show(ev.byGenius ? t('godEnd_genius', { name }) : t('godEnd_time', { name }), 2200, UI.TEXT_GOOD);
          break;
        }
        case 'geniusArrived':
          this.toast.show(t('geniusArrived', { n: ev.count }), 2600, UI.TEXT_GOLD);
          sfx.play('genius');
          break;
        case 'geniusUsed':
          sfx.play('genius');
          if (ev.result === 'workerBuff') {
            this.toast.show(t('geniusWorkerBuff', { n: GENIUS.WORKER_BUFF_SEC }), 2200, UI.TEXT_GOOD);
          } else if (ev.result === 'upgrade' && ev.target.type === 'trap') {
            const def = TRAP_BY_ID[ev.target.defId];
            this.toast.show(t('geniusUpgrade', { name: tn(def.name), n: this.world.trapLevel[def.id] ?? 0 }), 2200, UI.TEXT_GOOD);
          }
          break;
        case 'trapInvented':
          this.toast.show(`${t('invented')} ${tn(ev.def.name)}`, 2400, UI.TEXT_GOOD);
          sfx.play('invent');
          break;
        case 'gameOver': {
          const best = loadBest();
          const isNew = ev.floor > best;
          if (isNew) saveBest(ev.floor);
          this.selected = null;
          this.cancelGeniusDrag();
          this.popup.close();
          this.moving = null;
          sfx.play('gameOver');
          this.time.delayedCall(700, () => this.gameOverPanel.show(ev.floor, Math.max(best, ev.floor), isNew));
          break;
        }
      }
    }
  }

  /** 坂道上の位置 s が画面に見えていれば、その画面座標を返す（見えなければ null） */
  private visibleEnemyPos(s: number): { x: number; y: number } | null {
    if (s < this.world.hordeTop) return null;
    const v = this.view;
    const p = v.project(s, 0.35, TOWER_LOOK.RAMP_WIDTH * TOWER_LOOK.ENEMY_LANE);
    if (p.z > 0.05 && p.y > VIEW.TOP_BAR_HEIGHT && p.y < v.height - VIEW.BOTTOM_BAR_HEIGHT) return { x: p.x, y: p.y };
    return null;
  }

  /** 敵の集団に飲み込まれて見えない敵の数 */
  private countHiddenEnemies(): number {
    const base = this.world.hordeTop;
    if (base <= 0) return 0;
    let n = 0;
    for (const e of this.world.enemies) if (e.s < base) n++;
    return n;
  }

  // ------------------------------------------------------------
  //  メニュー
  // ------------------------------------------------------------

  private openMenu(): void {
    if (this.world.gameOver) return;
    this.paused = true;
    this.cancelGeniusDrag();
    this.popup.close();
    this.menu.open();
  }

  /** ロード画面を開く（選ぶとシーンを作り直してロードする） */
  private openLoadDialog(): void {
    this.loadDialog.open(listSaves(), (entry, mode) => {
      const data: GameStartData = { load: { entry, mode } };
      this.scene.restart(data);
    });
  }

  private closeMenu(): void {
    this.paused = false;
    this.menu.close();
  }

  // ------------------------------------------------------------
  //  デバッグ（?debug）
  // ------------------------------------------------------------

  private setupDebug(): void {
    this.debugText = makeText(this, 12, this.view.height - VIEW.BOTTOM_BAR_HEIGHT - 110, '', 18, '#9fffb0', {
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    }).setDepth(DEPTH.TOAST);
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-ONE', () => (this.debugSpeed = 1));
    kb.on('keydown-TWO', () => (this.debugSpeed = 3));
    kb.on('keydown-THREE', () => (this.debugSpeed = 10));
    kb.on('keydown-P', () => (this.world.points += 500));
    kb.on('keydown-F', () => this.world.debugAddFloors(1));
    kb.on('keydown-G', () => this.world.triggerGod());
    kb.on('keydown-Z', () => this.world.triggerGod('lightning'));
    kb.on('keydown-X', () => this.world.triggerGod('language'));
    kb.on('keydown-C', () => this.world.triggerGod('numbers'));
    kb.on('keydown-V', () => this.world.triggerGod('strike'));
    kb.on('keydown-B', () => this.world.triggerGod('seal'));
    kb.on('keydown-H', () => (this.world.geniuses += 1));
    // 集団の深さが分かるよう、起動時に案内
    this.toast.show(
      `DEBUG: 1/2/3=速度 P=+500 F=+1階 H=+天才\nG=妨害 Z=雷 X=言語 C=数値 V=停止 B=封印\n集団の深さ ${TOWER.HORDE_DEPTH_FLOORS}階`,
      4000,
      '#9fffb0',
    );
  }
}
