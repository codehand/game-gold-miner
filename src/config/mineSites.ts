import { BASE_GAME_BALANCE } from './balance';
import type { BaseGameBalanceConfig } from './types';

export const MINE_SITE_IDS = [
  'gold',
  'amethyst',
  'ruby',
  'sapphire',
  'emerald',
  'diamond',
] as const;

export type MineSiteId = (typeof MINE_SITE_IDS)[number];

export interface MineSiteConfig {
  readonly id: MineSiteId;
  readonly name: string;
  readonly resourceName: string;
  readonly resourceValueMultiplier: number;
  readonly upgradeCostMultiplier: number;
  readonly unlockPriceGold: string;
  readonly prerequisiteMineId: MineSiteId | null;
  readonly prerequisiteFloorId: string | null;
  readonly mapColor: string;
  readonly artKey: string;
}

/** Prices and value multipliers are the first balance pass, not final tuning. */
export const MINE_SITES: readonly MineSiteConfig[] = [
  {
    id: 'gold',
    name: 'Gold Mine',
    resourceName: 'Gold',
    resourceValueMultiplier: 1,
    upgradeCostMultiplier: 1,
    unlockPriceGold: '0',
    prerequisiteMineId: null,
    prerequisiteFloorId: null,
    mapColor: '#f6b72c',
    artKey: 'gold',
  },
  {
    id: 'amethyst',
    name: 'Amethyst Cavern',
    resourceName: 'Amethyst',
    resourceValueMultiplier: 2,
    upgradeCostMultiplier: 1.5,
    unlockPriceGold: '1e9',
    prerequisiteMineId: 'gold',
    prerequisiteFloorId: 'floor-5',
    mapColor: '#9b6bdd',
    artKey: 'amethyst',
  },
  {
    id: 'ruby',
    name: 'Ruby Crater',
    resourceName: 'Ruby',
    resourceValueMultiplier: 4,
    upgradeCostMultiplier: 1.9,
    unlockPriceGold: '5e9',
    prerequisiteMineId: 'amethyst',
    prerequisiteFloorId: 'floor-5',
    mapColor: '#db5265',
    artKey: 'ruby',
  },
  {
    id: 'sapphire',
    name: 'Sapphire Grotto',
    resourceName: 'Sapphire',
    resourceValueMultiplier: 8,
    upgradeCostMultiplier: 3.375,
    unlockPriceGold: '1e10',
    prerequisiteMineId: 'ruby',
    prerequisiteFloorId: 'floor-5',
    mapColor: '#4c85d6',
    artKey: 'sapphire',
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    resourceName: 'Emerald',
    resourceValueMultiplier: 16,
    upgradeCostMultiplier: 5.0625,
    unlockPriceGold: '5e10',
    prerequisiteMineId: 'sapphire',
    prerequisiteFloorId: 'floor-5',
    mapColor: '#48aa77',
    artKey: 'emerald',
  },
  {
    id: 'diamond',
    name: 'Diamond Peak',
    resourceName: 'Diamond',
    resourceValueMultiplier: 32,
    upgradeCostMultiplier: 7.59375,
    unlockPriceGold: '2.5e11',
    prerequisiteMineId: 'emerald',
    prerequisiteFloorId: 'floor-5',
    mapColor: '#a8e0ed',
    artKey: 'diamond',
  },
] as const;

export function getMineSite(id: MineSiteId): MineSiteConfig {
  const site = MINE_SITES.find((candidate) => candidate.id === id);
  if (site === undefined) {
    throw new Error(`Unknown mine site: ${id}`);
  }
  return site;
}

/** Core material quantities are gold-equivalent units, preserving conservation. */
export function getMineBalance(id: MineSiteId): BaseGameBalanceConfig {
  if (id === 'gold') return BASE_GAME_BALANCE;

  const site = getMineSite(id);
  const multiplier = site.resourceValueMultiplier;
  const costMultiplier = site.upgradeCostMultiplier;
  return {
    ...BASE_GAME_BALANCE,
    startingGold: 0,
    floors: BASE_GAME_BALANCE.floors.map((floor) => ({
      ...floor,
      baseYield: floor.baseYield * multiplier,
      upgrade: {
        ...floor.upgrade,
        baseCost: floor.upgrade.baseCost * costMultiplier,
      },
      unlockCost: floor.unlockCost * costMultiplier,
    })),
    elevator: {
      ...BASE_GAME_BALANCE.elevator,
      baseCapacity: BASE_GAME_BALANCE.elevator.baseCapacity * multiplier,
      upgrade: {
        ...BASE_GAME_BALANCE.elevator.upgrade,
        baseCost: BASE_GAME_BALANCE.elevator.upgrade.baseCost * costMultiplier,
      },
    },
    warehouse: {
      ...BASE_GAME_BALANCE.warehouse,
      baseCapacity: BASE_GAME_BALANCE.warehouse.baseCapacity * multiplier,
      upgrade: {
        ...BASE_GAME_BALANCE.warehouse.upgrade,
        baseCost: BASE_GAME_BALANCE.warehouse.upgrade.baseCost * costMultiplier,
      },
    },
  };
}
