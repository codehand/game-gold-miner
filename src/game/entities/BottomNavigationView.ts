import Phaser from 'phaser';

import {
  BOTTOM_NAVIGATION_MENU_TEXTURE_KEY,
  calculateNavigationArtworkDisplaySize,
} from '../assets/navigationAssets';
import {
  assertTouchTargetRegion,
  NAVIGATION_BACKGROUND,
  NAVIGATION_SHADOW,
  toFillColor,
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
}

const STANDARD_BUTTON_WIDTH = 48;
const STANDARD_BUTTON_HEIGHT = 44;
const BOOST_BUTTON_WIDTH = 62;
const BOOST_BUTTON_HEIGHT = 50;
const STANDARD_BUTTON_CENTER_Y = 40;
const BOOST_BUTTON_CENTER_Y = 40;
const COLOR_PRESSED_OVERLAY = toFillColor(NAVIGATION_SHADOW);
const MENU_ART_MARGIN = 2;

const ITEMS = [
  { key: 'rewards' },
  { key: 'shop' },
  { key: 'boost' },
  { key: 'managers' },
  { key: 'map' },
] as const satisfies readonly NavigationItemDefinition[];

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
    // The generated strip has transparent pixels around its outer shell. Keep
    // those pixels on the same continuous navigation surface instead of
    // exposing the dark mine background as a gap above or below the menu.
    const navigationBackdrop = scene.add
      .rectangle(
        region.width / 2,
        region.height / 2,
        region.width,
        region.height,
        toFillColor(NAVIGATION_BACKGROUND),
      )
      .setOrigin(0.5);
    this.#root.add(navigationBackdrop);

    // The processed runtime image is alpha-cropped to the visible menu. Fit it
    // uniformly inside the taller safe region so the tiles and icons retain
    // their source proportions instead of being vertically squashed.
    const menuSize = calculateNavigationArtworkDisplaySize(
      region.width,
      region.height,
      MENU_ART_MARGIN,
    );
    const menuArtwork = scene.add
      .image(
        region.width / 2,
        region.height / 2,
        BOTTOM_NAVIGATION_MENU_TEXTURE_KEY,
      )
      .setOrigin(0.5)
      .setScale(menuSize.scale);
    this.#root.add(menuArtwork);

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
    const button = scene.add.container(x, y);
    const pressOverlay = scene.add.graphics();
    const visual = scene.add.container(0, 0);
    let isPressed = false;

    const drawPressOverlay = (pressed: boolean): void => {
      pressOverlay.clear();
      if (pressed) {
        pressOverlay
          .fillStyle(COLOR_PRESSED_OVERLAY, 0.18)
          .fillRoundedRect(-width / 2, -height / 2, width, height, 9);
      }
    };

    drawPressOverlay(false);
    visual.add(pressOverlay);
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
        drawPressOverlay(true);
        scene.tweens.killTweensOf(visual);
      })
      .on('pointerout', () => {
        isPressed = false;
        drawPressOverlay(false);
      })
      .on('pointerup', () => {
        if (!isPressed) {
          return;
        }

        isPressed = false;
        drawPressOverlay(false);
        scene.tweens.killTweensOf(visual);
        onActivate?.(definition.key);
      });

    return button;
  }
}
