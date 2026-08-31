/** Runtime keys for the original Step 32 placeholder sprite family. */
export const PLACEHOLDER_TEXTURES = {
  elevatorCabin: 'step-32a-elevator-cabin',
  elevatorShaft: 'step-32a-elevator-shaft',
  elevator: 'placeholder-elevator',
  floorBackground: 'step-32a-mine-floor-background',
  goldContainer: 'step-32a-gold-container',
  goldCoin: 'placeholder-gold-coin',
  goldPile: 'placeholder-gold-pile',
  locked: 'placeholder-locked',
  mineCart: 'placeholder-mine-cart',
  minerCat: 'placeholder-miner-cat',
  oreCrate: 'placeholder-ore-crate',
  upgrade: 'placeholder-upgrade',
  warehouse: 'placeholder-warehouse',
} as const;

export const PLACEHOLDER_ASSETS = [
  [PLACEHOLDER_TEXTURES.elevatorCabin, '/assets/step-32a/elevator-cabin.png'],
  [PLACEHOLDER_TEXTURES.elevatorShaft, '/assets/step-32a/elevator-shaft.png'],
  [PLACEHOLDER_TEXTURES.elevator, '/assets/placeholder/elevator.png'],
  [PLACEHOLDER_TEXTURES.floorBackground, '/assets/step-32a/mine-floor-background.png'],
  [PLACEHOLDER_TEXTURES.goldContainer, '/assets/step-32a/gold-container.png'],
  [PLACEHOLDER_TEXTURES.goldCoin, '/assets/placeholder/gold-coin.png'],
  [PLACEHOLDER_TEXTURES.goldPile, '/assets/step-32a/gold-pile.png'],
  [PLACEHOLDER_TEXTURES.locked, '/assets/placeholder/locked.png'],
  [PLACEHOLDER_TEXTURES.mineCart, '/assets/placeholder/mine-cart.png'],
  [PLACEHOLDER_TEXTURES.minerCat, '/assets/placeholder/miner-cat.png'],
  [PLACEHOLDER_TEXTURES.oreCrate, '/assets/placeholder/ore-crate.png'],
  [PLACEHOLDER_TEXTURES.upgrade, '/assets/placeholder/upgrade.png'],
  [PLACEHOLDER_TEXTURES.warehouse, '/assets/placeholder/warehouse.png'],
] as const;

/** Step 32A generated animation sheets; every frame is one 128x128 cell. */
export const PLACEHOLDER_ANIMATION_TEXTURES = {
  elevatorCargoCat: 'step-32a-elevator-cargo-cat-animation',
  elevatorPulley: 'placeholder-elevator-pulley-animation',
  minerDig: 'placeholder-miner-dig-animation',
  minerWalk: 'step-32a-miner-walk-animation',
  unloaderIdle: 'step-32a-unloader-idle-animation',
  warehouseReceive: 'placeholder-warehouse-receive-animation',
} as const;

export const PLACEHOLDER_ANIMATION_ASSETS = [
  [
    PLACEHOLDER_ANIMATION_TEXTURES.elevatorCargoCat,
    '/assets/step-32a/elevator-cargo-cat-sheet.png',
  ],
  [
    PLACEHOLDER_ANIMATION_TEXTURES.elevatorPulley,
    '/assets/placeholder/animated/elevator-pulley-sheet.png',
  ],
  [
    PLACEHOLDER_ANIMATION_TEXTURES.minerDig,
    '/assets/placeholder/animated/miner-dig-sheet.png',
  ],
  [
    PLACEHOLDER_ANIMATION_TEXTURES.minerWalk,
    '/assets/step-32a/miner-walk-sheet.png',
  ],
  [
    PLACEHOLDER_ANIMATION_TEXTURES.unloaderIdle,
    '/assets/step-32a/unloader-idle-sheet.png',
  ],
  [
    PLACEHOLDER_ANIMATION_TEXTURES.warehouseReceive,
    '/assets/placeholder/animated/warehouse-receive-sheet.png',
  ],
] as const;

export const PLACEHOLDER_ANIMATION_FRAME_SIZE = 128;
export const PLACEHOLDER_ANIMATION_FRAME_COUNT = 4;
