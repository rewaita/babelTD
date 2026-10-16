/**
 * UIの部品（文字・ボタン）を作る補助関数
 */
import Phaser from 'phaser';
import { FONT, UI } from './theme';

/** 文字を作る（高解像度で描くので拡大してもにじみにくい） */
export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 24,
  color: string = UI.TEXT,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, ...style })
    .setResolution(2);
}

export interface Button {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setEnabled(enabled: boolean): void;
  setLabel(text: string): void;
}

export interface ButtonOptions {
  fontSize?: number;
  fill?: number;
  edge?: number;
  textColor?: string;
}

/** ボタンを作る。押した瞬間（pointerdown）に onClick が呼ばれる */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): Button {
  const container = scene.add.container(x, y);
  const bg = scene.add
    .rectangle(0, 0, w, h, opts.fill ?? UI.BUTTON)
    .setStrokeStyle(2, opts.edge ?? UI.PANEL_EDGE);
  const label = makeText(scene, 0, 0, text, opts.fontSize ?? 26, opts.textColor ?? UI.TEXT).setOrigin(0.5);
  container.add([bg, label]);
  bg.setInteractive({ useHandCursor: true });
  let enabled = true;
  bg.on(
    'pointerdown',
    (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (enabled) onClick();
    },
  );
  return {
    container,
    bg,
    label,
    setEnabled(b: boolean) {
      enabled = b;
      container.setAlpha(b ? 1 : 0.45);
    },
    setLabel(s: string) {
      if (label.text !== s) label.setText(s);
    },
  };
}
