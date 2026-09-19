import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getMarketplaceIcon,
  MARKETPLACE_ICONS,
  MARKETPLACE_ICON_IDS,
} from '../../src/ui/marketplaceIconRegistry';

interface IconManifest {
  readonly path: string;
  readonly viewBox: string;
  readonly rights: {
    readonly thirdPartyAssets: boolean;
    readonly externalBranding: boolean;
    readonly bakedText: boolean;
  };
  readonly icons: readonly {
    readonly id: string;
    readonly category: string;
    readonly label: string;
    readonly colorIndependent?: boolean;
  }[];
}

const manifest = JSON.parse(
  readFileSync(resolve('public/assets/marketplace/icons/manifest.json'), 'utf8'),
) as IconManifest;
const sprite = readFileSync(
  resolve('public/assets/marketplace/icons/marketplace-icons.svg'),
  'utf8',
);

describe('Marketplace Phase 2 icon family', () => {
  it('keeps the icon registry and manifest in lockstep', () => {
    expect(manifest.path).toBe('/assets/marketplace/icons/marketplace-icons.svg');
    expect(manifest.viewBox).toBe('0 0 24 24');
    expect(manifest.icons.map((icon) => icon.id)).toEqual(MARKETPLACE_ICON_IDS);
    expect(MARKETPLACE_ICONS.map((icon) => icon.label)).toEqual(
      manifest.icons.map((icon) => icon.label),
    );
    expect(new Set(MARKETPLACE_ICON_IDS).size).toBe(MARKETPLACE_ICON_IDS.length);
  });

  it('covers the complete v1 role, attribute, skill, and state families', () => {
    expect(MARKETPLACE_ICONS.filter((icon) => icon.category === 'role')).toHaveLength(3);
    expect(MARKETPLACE_ICONS.filter((icon) => icon.category === 'attribute')).toHaveLength(4);
    expect(MARKETPLACE_ICONS.filter((icon) => icon.category === 'skill')).toHaveLength(3);
    expect(MARKETPLACE_ICONS.filter((icon) => icon.category === 'state')).toHaveLength(6);
    expect(MARKETPLACE_ICONS.filter((icon) => icon.category === 'state').every(
      (icon) => icon.colorIndependent,
    )).toBe(true);
  });

  it('contains one valid SVG symbol for every allowlisted icon', () => {
    expect(sprite.startsWith('<svg ')).toBe(true);
    expect(sprite).not.toContain('<text');
    expect(sprite).not.toContain('<image');

    for (const icon of MARKETPLACE_ICONS) {
      expect(sprite).toContain(`<symbol id="${icon.id}"`);
      expect(getMarketplaceIcon(icon.id)).toEqual(icon);
    }
    expect(getMarketplaceIcon('state-not-real')).toBeNull();
  });

  it('records original, text-free, third-party-free provenance', () => {
    expect(manifest.rights).toEqual({
      thirdPartyAssets: false,
      externalBranding: false,
      bakedText: false,
    });
    expect(manifest.icons.every((icon) => icon.label.length > 0)).toBe(true);
  });
});
