export const BOTTOM_NAVIGATION_MENU_TEXTURE_KEY = 'bottom-navigation-menu';
export const BOTTOM_NAVIGATION_MENU_ASSET_PATH =
  '/assets/ui/navigation/bottom-navigation-menu.png';
// The runtime texture is a 2× high-quality resample of the alpha-cropped
// source, so Phaser can draw it at an exact 0.5 scale into the logical menu.
export const BOTTOM_NAVIGATION_MENU_SOURCE_WIDTH = 712;
export const BOTTOM_NAVIGATION_MENU_SOURCE_HEIGHT = 150;

export interface NavigationArtworkDisplaySize {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/**
 * Fits the generated menu without distorting its tile or icon proportions.
 * The runtime region can be wider than the source artwork, so both axes must
 * use the same scale and the remaining space becomes a safe margin.
 */
export function calculateNavigationArtworkDisplaySize(
  regionWidth: number,
  regionHeight: number,
  margin: number,
): NavigationArtworkDisplaySize {
  const availableWidth = regionWidth - margin * 2;
  const availableHeight = regionHeight - margin * 2;
  const scale = Math.min(
    availableWidth / BOTTOM_NAVIGATION_MENU_SOURCE_WIDTH,
    availableHeight / BOTTOM_NAVIGATION_MENU_SOURCE_HEIGHT,
  );

  return {
    width: BOTTOM_NAVIGATION_MENU_SOURCE_WIDTH * scale,
    height: BOTTOM_NAVIGATION_MENU_SOURCE_HEIGHT * scale,
    scale,
  };
}
