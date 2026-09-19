import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARKETPLACE_ASSETS } from '../../src/ui/marketplaceAssetRegistry';
import { MARKETPLACE_ICONS } from '../../src/ui/marketplaceIconRegistry';

interface ManifestVariant {
  assetId?: string;
  runtimeIntegrated?: boolean;
}

const manifest = JSON.parse(
  readFileSync(resolve('art-source/cat-role-catalog/asset-manifest.json'), 'utf8'),
) as {
  scope: { runtimeIntegration: boolean };
  roles: Array<{ variants: ManifestVariant[] }>;
};

const provenance = readFileSync(resolve('public/assets/marketplace/provenance.md'), 'utf8');

describe('Marketplace release audit', () => {
  it('keeps every public portrait linked to a source, manifest ID, and provenance record', () => {
    const manifestIds = new Set(
      manifest.roles
        .flatMap((role) => role.variants)
        .flatMap((variant) => (variant.assetId ? [variant.assetId] : [])),
    );
    const registryIds = new Set(MARKETPLACE_ASSETS.map((asset) => asset.assetId));

    expect(registryIds.size).toBe(MARKETPLACE_ASSETS.length);
    for (const asset of MARKETPLACE_ASSETS) {
      expect(existsSync(resolve('public', asset.portraitPath.slice(1))), asset.assetId).toBe(true);
      expect(existsSync(resolve(asset.sourcePortraitPath)), `${asset.assetId} source`).toBe(true);
      expect(manifestIds.has(asset.assetId), `${asset.assetId} manifest`).toBe(true);
      expect(provenance).toContain(asset.assetId);
      expect(asset.runtimeIntegrated, asset.assetId).toBe(false);
    }
  });

  it('keeps the release catalog asset-only and the icon sprite complete', () => {
    expect(manifest.scope.runtimeIntegration).toBe(false);
    expect(manifest.roles.flatMap((role) => role.variants).every(
      (variant) => variant.runtimeIntegrated !== true,
    )).toBe(true);
    expect(existsSync(resolve('public/assets/marketplace/icons/marketplace-icons.svg'))).toBe(true);
    expect(existsSync(resolve('public/assets/marketplace/icons/manifest.json'))).toBe(true);
    expect(MARKETPLACE_ICONS).toHaveLength(16);
  });
});
