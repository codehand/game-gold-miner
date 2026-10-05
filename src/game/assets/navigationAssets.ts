/** Independent transparent textures; menu chrome and labels are renderer-owned. */
export const NAVIGATION_ICON_SOURCE_SIZE = 96;
export const NAVIGATION_ICON_DISPLAY_SIZE = 42;

export const NAVIGATION_ICON_ASSETS = [
  {
    key: 'rewards',
    label: 'Rewards',
    textureKey: 'navigation-icon-rewards',
    path: '/assets/ui/navigation/icons/rewards.png',
  },
  {
    key: 'shop',
    label: 'Shop',
    textureKey: 'navigation-icon-shop',
    path: '/assets/ui/navigation/icons/shop.png',
  },
  {
    key: 'boost',
    label: 'Boost',
    textureKey: 'navigation-icon-boost',
    path: '/assets/ui/navigation/icons/boost.png',
  },
  {
    key: 'managers',
    label: 'Cats',
    textureKey: 'navigation-icon-managers',
    path: '/assets/ui/navigation/icons/managers.png',
  },
  {
    key: 'map',
    label: 'Map',
    textureKey: 'navigation-icon-map',
    path: '/assets/ui/navigation/icons/map.png',
  },
] as const;

export type NavigationIconKey = (typeof NAVIGATION_ICON_ASSETS)[number]['key'];
