import Phaser from 'phaser';

import {
  NAVIGATION_ICON_ASSETS,
  NAVIGATION_ICON_DISPLAY_SIZE,
  type NavigationIconKey,
} from '../assets/navigationAssets';
import {
  assertTouchTargetRegion,
  DIVIDER,
  FONT_FAMILY,
  FONT_STYLE_SEMIBOLD,
  NAVIGATION_BACKGROUND,
  NAVIGATION_BUTTON,
  NAVIGATION_BUTTON_BORDER,
  NAVIGATION_BUTTON_PRESSED,
  NAVIGATION_ICON,
  NAVIGATION_SHADOW,
  toFillColor,
  type LayoutRegion,
} from '../layout';

export type BottomNavigationItemKey = NavigationIconKey;

export interface RenderedBottomNavigationItem {
  readonly key: BottomNavigationItemKey;
  readonly bounds: LayoutRegion;
  readonly iconTextureKey: string;
}

export interface BottomNavigationViewOptions {
  readonly onActivate?: (key: BottomNavigationItemKey) => void;
}

type NavigationItemDefinition = (typeof NAVIGATION_ICON_ASSETS)[number];

const BUTTON_SIZE = 64;
const BUTTON_CENTER_Y = 40;
const BUTTON_RADIUS = 11;

/**
 * Fixed bottom navigation with independent item textures and code-drawn chrome.
 *
 * Activation remains a presentation callback: no screen, economy rule, or
 * saved state is introduced before those features receive their own milestone.
 */
export class BottomNavigationView {
  readonly #root: Phaser.GameObjects.Container;
  readonly #items: readonly RenderedBottomNavigationItem[];
  #boostLabel: Phaser.GameObjects.Text | null = null;
  #boostBadge: Phaser.GameObjects.Text | null = null;
  #boostSeconds = -1;

  public constructor(
    scene: Phaser.Scene,
    region: LayoutRegion,
    options: BottomNavigationViewOptions = {},
  ) {
    this.#root = scene.add.container(region.x, region.y);
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
    this.#root.add(
      scene.add.rectangle(
        region.width / 2,
        1,
        region.width,
        2,
        toFillColor(DIVIDER),
      ),
    );

    const slotWidth = region.width / NAVIGATION_ICON_ASSETS.length;
    const renderedItems: RenderedBottomNavigationItem[] = [];

    NAVIGATION_ICON_ASSETS.forEach((definition, index) => {
      const width = BUTTON_SIZE;
      const height = BUTTON_SIZE;
      const centerX = slotWidth * (index + 0.5);
      const centerY = BUTTON_CENTER_Y;
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
        iconTextureKey: definition.textureKey,
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

  /** One text update per elapsed second; none on unchanged render frames. */
  public setBoostRemainingMs(remainingMs: number): void {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    if (seconds === this.#boostSeconds) return;
    this.#boostSeconds = seconds;
    if (this.#boostLabel === null || this.#boostBadge === null) return;
    this.#boostLabel.setText(seconds === 0
      ? 'Boost'
      : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    this.#boostBadge.setVisible(seconds > 0);
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
    const tile = scene.add.graphics();
    const icon = scene.add
      .image(0, -9, definition.textureKey)
      .setDisplaySize(NAVIGATION_ICON_DISPLAY_SIZE, NAVIGATION_ICON_DISPLAY_SIZE);
    const label = scene.add
      .text(0, 23, definition.label, {
        fontFamily: FONT_FAMILY,
        fontStyle: FONT_STYLE_SEMIBOLD,
        fontSize: '10px',
        color: NAVIGATION_ICON,
      })
      .setOrigin(0.5);
    const badge = definition.key === 'boost'
      ? scene.add.text(22, -26, '×4', {
          fontFamily: FONT_FAMILY,
          fontStyle: FONT_STYLE_SEMIBOLD,
          fontSize: '10px',
          color: '#ffe08b',
          backgroundColor: '#6b4518',
          padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setVisible(false)
      : null;
    if (definition.key === 'boost') {
      this.#boostLabel = label;
      this.#boostBadge = badge;
    }
    let isPressed = false;

    const drawTile = (pressed: boolean): void => {
      tile.clear();
      tile.fillStyle(toFillColor(NAVIGATION_SHADOW), 0.6);
      tile.fillRoundedRect(
        -width / 2,
        -height / 2 + 2,
        width,
        height,
        BUTTON_RADIUS,
      );
      tile.fillStyle(
        toFillColor(pressed ? NAVIGATION_BUTTON_PRESSED : NAVIGATION_BUTTON),
      );
      tile.fillRoundedRect(
        -width / 2,
        -height / 2,
        width,
        height - 2,
        BUTTON_RADIUS,
      );
      tile.lineStyle(1, toFillColor(NAVIGATION_BUTTON_BORDER));
      tile.strokeRoundedRect(
        -width / 2 + 0.5,
        -height / 2 + 0.5,
        width - 1,
        height - 3,
        BUTTON_RADIUS,
      );
    };

    drawTile(false);
    button.add([tile, icon, label]);
    if (badge !== null) button.add(badge);
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
        drawTile(true);
      })
      .on('pointerout', () => {
        isPressed = false;
        drawTile(false);
      })
      .on('pointerup', () => {
        if (!isPressed) {
          return;
        }

        isPressed = false;
        drawTile(false);
        onActivate?.(definition.key);
      });

    return button;
  }
}
