/** Runtime keys for the original Step 32 placeholder sprite family. */
export const PLACEHOLDER_TEXTURES = {
  elevator: 'placeholder-elevator',
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
  [PLACEHOLDER_TEXTURES.elevator, '/assets/placeholder/elevator.png'],
  [PLACEHOLDER_TEXTURES.goldCoin, '/assets/placeholder/gold-coin.png'],
  [PLACEHOLDER_TEXTURES.goldPile, '/assets/placeholder/gold-pile.png'],
  [PLACEHOLDER_TEXTURES.locked, '/assets/placeholder/locked.png'],
  [PLACEHOLDER_TEXTURES.mineCart, '/assets/placeholder/mine-cart.png'],
  [PLACEHOLDER_TEXTURES.minerCat, '/assets/placeholder/miner-cat.png'],
  [PLACEHOLDER_TEXTURES.oreCrate, '/assets/placeholder/ore-crate.png'],
  [PLACEHOLDER_TEXTURES.upgrade, '/assets/placeholder/upgrade.png'],
  [PLACEHOLDER_TEXTURES.warehouse, '/assets/placeholder/warehouse.png'],
] as const;
