import Phaser from 'phaser';

import {
  assertTouchTargetRegion,
  toFillColor,
  DIVIDER,
  NAVIGATION_BACKGROUND,
  NAVIGATION_BOOST,
  NAVIGATION_BOOST_BORDER,
  NAVIGATION_BUTTON,
  NAVIGATION_BUTTON_BORDER,
  NAVIGATION_BUTTON_PRESSED,
  NAVIGATION_ICON,
  NAVIGATION_SHADOW,
  PROGRESS_FILL,
  type LayoutRegion,
} from '../layout';

export type BottomNavigationItemKey =
  | 'rewards'
  | 'shop'
  | 'boost'
  | 'managers'
  | 'map';

export interface RenderedBottomNavigationItem {
  readonly key: BottomNavigationItemKey;
  readonly bounds: LayoutRegion;
}

export interface BottomNavigationViewOptions {
  readonly onActivate?: (key: BottomNavigationItemKey) => void;
}

interface NavigationItemDefinition {
  readonly key: BottomNavigationItemKey;
  readonly drawIcon: (graphics: Phaser.GameObjects.Graphics) => void;
}

const COLOR_BACKGROUND = toFillColor(NAVIGATION_BACKGROUND);
const COLOR_DIVIDER = toFillColor(DIVIDER);
const COLOR_BUTTON = toFillColor(NAVIGATION_BUTTON);
const COLOR_BUTTON_BORDER = toFillColor(NAVIGATION_BUTTON_BORDER);
const COLOR_BUTTON_PRESSED = toFillColor(NAVIGATION_BUTTON_PRESSED);
const COLOR_BOOST = toFillColor(NAVIGATION_BOOST);
const COLOR_BOOST_BORDER = toFillColor(NAVIGATION_BOOST_BORDER);
const COLOR_ICON = toFillColor(NAVIGATION_ICON);
const COLOR_SHADOW = toFillColor(NAVIGATION_SHADOW);
const COLOR_TEAL = toFillColor(PROGRESS_FILL);

const STANDARD_BUTTON_WIDTH = 48;
const STANDARD_BUTTON_HEIGHT = 44;
const BOOST_BUTTON_WIDTH = 62;
const BOOST_BUTTON_HEIGHT = 50;
const STANDARD_BUTTON_CENTER_Y = 33;
const BOOST_BUTTON_CENTER_Y = 25;
const BUTTON_VISUAL_SCALE = 0.6;

const ITEMS: readonly NavigationItemDefinition[] = [
  { key: 'rewards', drawIcon: drawRewardsIcon },
  { key: 'shop', drawIcon: drawShopIcon },
  { key: 'boost', drawIcon: drawBoostIcon },
  { key: 'managers', drawIcon: drawManagersIcon },
  { key: 'map', drawIcon: drawMapIcon },
];

/**
 * Fixed, icon-only bottom navigation.
 *
 * Activation remains a presentation callback: no screen, economy rule, or
 * saved state is introduced before those features receive their own milestone.
 */
export class BottomNavigationView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #items: readonly RenderedBottomNavigationItem[];

  public constructor(
    scene: Phaser.Scene,
    region: LayoutRegion,
    options: BottomNavigationViewOptions = {},
  ) {
    this.#root = scene.add.container(region.x, region.y);
    this.#root.add([
      scene.add
        .rectangle(0, 0, region.width, region.height, COLOR_BACKGROUND)
        .setOrigin(0, 0),
      scene.add
        .rectangle(0, 0, region.width, 2, COLOR_DIVIDER)
        .setOrigin(0, 0),
    ]);

    const slotWidth = region.width / ITEMS.length;
    const renderedItems: RenderedBottomNavigationItem[] = [];

    ITEMS.forEach((definition, index) => {
      const isBoost = definition.key === 'boost';
      const width = isBoost ? BOOST_BUTTON_WIDTH : STANDARD_BUTTON_WIDTH;
      const height = isBoost ? BOOST_BUTTON_HEIGHT : STANDARD_BUTTON_HEIGHT;
      const centerX = slotWidth * (index + 0.5);
      const centerY = isBoost
        ? BOOST_BUTTON_CENTER_Y
        : STANDARD_BUTTON_CENTER_Y;
      const localBounds = {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
      };

      assertTouchTargetRegion(localBounds, `${definition.key} navigation button`);

      this.#root.add(
        this.#createButton(
          scene,
          definition,
          centerX,
          centerY,
          width,
          height,
          options.onActivate,
        ),
      );
      renderedItems.push({
        key: definition.key,
        bounds: {
          x: region.x + localBounds.x,
          y: region.y + localBounds.y,
          width,
          height,
        },
      });
    });

    this.#items = renderedItems;
  }

  public get root(): Phaser.GameObjects.Container {
    return this.#root;
  }

  public describeRenderedItems(): readonly RenderedBottomNavigationItem[] {
    return this.#items;
  }

  #createButton(
    scene: Phaser.Scene,
    definition: NavigationItemDefinition,
    x: number,
    y: number,
    width: number,
    height: number,
    onActivate: BottomNavigationViewOptions['onActivate'],
  ): Phaser.GameObjects.Container {
    const isBoost = definition.key === 'boost';
    const button = scene.add.container(x, y);
    const shadow = scene.add.graphics();
    const background = scene.add.graphics();
    const icon = scene.add.graphics();
    const visual = scene.add.container(0, 0);
    let isPressed = false;

    shadow
      .fillStyle(COLOR_SHADOW, 0.58)
      .fillRoundedRect(-width / 2 + 1, -height / 2 + 3, width, height, 9);

    const drawBackground = (pressed: boolean): void => {
      background.clear();
      background.fillStyle(
        pressed ? COLOR_BUTTON_PRESSED : isBoost ? COLOR_BOOST : COLOR_BUTTON,
        1,
      );
      background.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
      background.lineStyle(
        2,
        isBoost ? COLOR_BOOST_BORDER : COLOR_BUTTON_BORDER,
        1,
      );
      background.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    };

    drawBackground(false);
    definition.drawIcon(icon);
    visual.add([shadow, background, icon]);
    visual.setScale(BUTTON_VISUAL_SCALE);
    button.add(visual);
    button
      .setSize(width, height)
      .setInteractive(
        // InputManager adds the Container's half-size display origin before
        // hit testing. Use top-left coordinates here, even though the artwork
        // is drawn around (0, 0), or the target shifts up and left.
        new Phaser.Geom.Rectangle(0, 0, width, height),
        Phaser.Geom.Rectangle.Contains,
      )
      .on('pointerdown', () => {
        isPressed = true;
        drawBackground(true);
        // A rapid second press can land while the previous release's 130 ms
        // `Back.Out` tween (below) is still running; without killing it here,
        // the tween keeps writing scaleX/scaleY after this pointerdown's own
        // scale, and the button visually never looks pressed.
        scene.tweens.killTweensOf(visual);
        visual.setScale(BUTTON_VISUAL_SCALE * 0.96);
      })
      .on('pointerout', () => {
        isPressed = false;
        drawBackground(false);
        visual.setScale(BUTTON_VISUAL_SCALE);
      })
      .on('pointerup', () => {
        if (!isPressed) {
          return;
        }

        isPressed = false;
        drawBackground(false);
        scene.tweens.killTweensOf(visual);
        scene.tweens.add({
          targets: visual,
          scaleX: BUTTON_VISUAL_SCALE,
          scaleY: BUTTON_VISUAL_SCALE,
          duration: 130,
          ease: 'Back.Out',
        });
        onActivate?.(definition.key);
      });

    return button;
  }
}

function drawRewardsIcon(graphics: Phaser.GameObjects.Graphics): void {
  // A compact treasure chest: gold lid, pale body, dark straps and keyhole.
  graphics.fillStyle(COLOR_BOOST, 1).fillRoundedRect(-12, -9, 24, 8, 4);
  graphics.lineStyle(2, COLOR_BACKGROUND, 1).strokeRoundedRect(-12, -9, 24, 8, 4);
  graphics.fillStyle(COLOR_ICON, 1).fillRoundedRect(-11, -2, 22, 13, 3);
  graphics.lineStyle(2, COLOR_BACKGROUND, 1).strokeRoundedRect(-11, -2, 22, 13, 3);
  graphics.fillStyle(COLOR_TEAL, 1).fillRect(-8, 0, 3, 9).fillRect(5, 0, 3, 9);
  graphics.fillStyle(COLOR_BOOST, 1).fillRoundedRect(-3, 1, 6, 6, 2);
  graphics.fillStyle(COLOR_BACKGROUND, 1).fillCircle(0, 4, 1.4);
}

function drawShopIcon(graphics: Phaser.GameObjects.Graphics): void {
  // A storefront reads more clearly than the former shopping-bag silhouette.
  graphics.fillStyle(COLOR_ICON, 1).fillRoundedRect(-11, -4, 22, 15, 2);
  graphics.lineStyle(2, COLOR_BACKGROUND, 1).strokeRoundedRect(-11, -4, 22, 15, 2);
  graphics.fillStyle(COLOR_BOOST, 1).fillRoundedRect(-13, -11, 26, 8, 3);
  graphics.lineStyle(2, COLOR_BACKGROUND, 1).strokeRoundedRect(-13, -11, 26, 8, 3);
  graphics.fillStyle(COLOR_TEAL, 1);
  graphics.fillRect(-7, -10, 5, 6).fillRect(4, -10, 5, 6);
  graphics.fillStyle(COLOR_BUTTON, 1).fillRoundedRect(-7, 1, 7, 10, 1);
  graphics.fillStyle(COLOR_TEAL, 1).fillRoundedRect(3, 0, 5, 5, 1);
  graphics.fillStyle(COLOR_BOOST, 1).fillCircle(-2, 6, 1);
}

function drawBoostIcon(graphics: Phaser.GameObjects.Graphics): void {
  // Smaller bolt with restrained orbit marks; the gold button carries emphasis.
  graphics.lineStyle(2, COLOR_ICON, 0.82).strokeCircle(0, 0, 17);
  graphics.fillStyle(COLOR_BACKGROUND, 1);
  graphics.beginPath();
  graphics.moveTo(4, -14);
  graphics.lineTo(-8, 2);
  graphics.lineTo(-1, 2);
  graphics.lineTo(-5, 14);
  graphics.lineTo(10, -5);
  graphics.lineTo(3, -5);
  graphics.closePath().fillPath();
  graphics.lineStyle(2, COLOR_BACKGROUND, 0.78);
  graphics.strokeLineShape(new Phaser.Geom.Line(-20, 0, -17, 0));
  graphics.strokeLineShape(new Phaser.Geom.Line(17, 0, 20, 0));
}

function drawManagersIcon(graphics: Phaser.GameObjects.Graphics): void {
  // Cat portrait badge: pale face, gold ears and a teal supervisor collar.
  graphics.fillStyle(COLOR_ICON, 1).fillCircle(0, 1, 13);
  graphics.lineStyle(2, COLOR_BACKGROUND, 1).strokeCircle(0, 1, 13);
  graphics.fillStyle(COLOR_BOOST, 1);
  graphics.beginPath();
  graphics.moveTo(-11, -6);
  graphics.lineTo(-9, -14);
  graphics.lineTo(-3, -9);
  graphics.lineTo(3, -9);
  graphics.lineTo(9, -14);
  graphics.lineTo(11, -6);
  graphics.lineTo(6, -3);
  graphics.lineTo(-6, -3);
  graphics.closePath().fillPath();
  graphics.fillStyle(COLOR_BACKGROUND, 1).fillCircle(-5, 0, 1.5).fillCircle(5, 0, 1.5);
  graphics.fillStyle(COLOR_BOOST, 1).fillTriangle(-2, 4, 2, 4, 0, 7);
  graphics.fillStyle(COLOR_TEAL, 1).fillRoundedRect(-7, 9, 14, 4, 2);
}

function drawMapIcon(graphics: Phaser.GameObjects.Graphics): void {
  // Three folded panels with a teal route and a gold destination marker.
  graphics.fillStyle(COLOR_ICON, 1);
  graphics.beginPath();
  graphics.moveTo(-13, -10);
  graphics.lineTo(-5, -13);
  graphics.lineTo(5, -10);
  graphics.lineTo(13, -13);
  graphics.lineTo(13, 10);
  graphics.lineTo(5, 13);
  graphics.lineTo(-5, 10);
  graphics.lineTo(-13, 13);
  graphics.closePath().fillPath();
  graphics.lineStyle(2, COLOR_BACKGROUND, 1);
  graphics.strokeLineShape(new Phaser.Geom.Line(-5, -13, -5, 10));
  graphics.strokeLineShape(new Phaser.Geom.Line(5, -10, 5, 13));
  graphics.lineStyle(2, COLOR_TEAL, 1);
  graphics.beginPath();
  graphics.moveTo(-10, 7);
  graphics.lineTo(-5, 3);
  graphics.lineTo(0, 5);
  graphics.lineTo(8, -4);
  graphics.strokePath();
  graphics.fillStyle(COLOR_BOOST, 1).fillCircle(8, -4, 3);
  graphics.fillStyle(COLOR_BACKGROUND, 1).fillCircle(8, -4, 1);
}
