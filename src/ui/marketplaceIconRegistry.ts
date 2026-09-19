export type MarketplaceIconCategory = 'role' | 'attribute' | 'skill' | 'state';

export interface MarketplaceIconRecord {
  readonly id: string;
  readonly category: MarketplaceIconCategory;
  readonly label: string;
  readonly symbolHref: string;
  readonly colorIndependent: boolean;
}

const ICON_SPRITE_PATH = '/assets/marketplace/icons/marketplace-icons.svg';

const MARKETPLACE_ICON_ENTRIES = [
  ['role-elevator', 'role', 'Elevator', false],
  ['role-warehouse', 'role', 'Warehouse', false],
  ['role-miner', 'role', 'Miner', false],
  ['attribute-power', 'attribute', 'Power', false],
  ['attribute-speed', 'attribute', 'Speed', false],
  ['attribute-capacity', 'attribute', 'Capacity', false],
  ['attribute-efficiency', 'attribute', 'Efficiency', false],
  ['skill-lift-mastery', 'skill', 'Lift Mastery', false],
  ['skill-storage-mastery', 'skill', 'Storage Mastery', false],
  ['skill-mining-mastery', 'skill', 'Mining Mastery', false],
  ['state-idle', 'state', 'Idle', true],
  ['state-assigned', 'state', 'Assigned', true],
  ['state-listed', 'state', 'Listed', true],
  ['state-rented', 'state', 'Rented', true],
  ['state-locked', 'state', 'Locked', true],
  ['state-rental-expiring', 'state', 'Rental expiring', true],
] as const satisfies readonly (readonly [string, MarketplaceIconCategory, string, boolean])[];

export const MARKETPLACE_ICON_IDS = MARKETPLACE_ICON_ENTRIES.map(
  ([id]) => id,
) as readonly string[];

export const MARKETPLACE_ICONS: readonly MarketplaceIconRecord[] =
  MARKETPLACE_ICON_ENTRIES.map(([id, category, label, colorIndependent]) => ({
    id,
    category,
    label,
    symbolHref: `${ICON_SPRITE_PATH}#${id}`,
    colorIndependent,
  }));

const MARKETPLACE_ICON_BY_ID = new Map<string, MarketplaceIconRecord>(
  MARKETPLACE_ICONS.map((icon) => [icon.id, icon]),
);

export function getMarketplaceIcon(iconId: string): MarketplaceIconRecord | null {
  return MARKETPLACE_ICON_BY_ID.get(iconId) ?? null;
}
