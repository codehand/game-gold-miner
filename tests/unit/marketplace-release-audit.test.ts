import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARKETPLACE_ASSETS } from '../../src/ui/marketplaceAssetRegistry';
import { MARKETPLACE_ICONS } from '../../src/ui/marketplaceIconRegistry';
import {
  MARKETPLACE_RUNTIME_ASSET_IDS,
  MARKETPLACE_RUNTIME_ROLE_ASSETS,
} from '../../src/game/assets/marketplaceRuntimeAssets';

interface ManifestVariant {
  assetId?: string;
  runtimeIntegrated?: boolean;
}

const manifest = JSON.parse(
  readFileSync(resolve('art-source/cat-role-catalog/asset-manifest.json'), 'utf8'),
) as {
  scope: { assetOnly: boolean; runtimeIntegration: boolean };
  roles: Array<{ variants: ManifestVariant[] }>;
};

const provenance = readFileSync(resolve('public/assets/marketplace/provenance.md'), 'utf8');

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('Marketplace release audit', () => {
  it('keeps every public portrait linked to a source, manifest ID, and provenance record', () => {
    const manifestIds = new Set(
      manifest.roles
        .flatMap((role) => role.variants)
        .flatMap((variant) => (variant.assetId ? [variant.assetId] : [])),
    );
    const registryIds = new Set(MARKETPLACE_ASSETS.map((asset) => asset.assetId));
    const runtimeIds = new Set<string>(MARKETPLACE_RUNTIME_ASSET_IDS);

    expect(registryIds.size).toBe(MARKETPLACE_ASSETS.length);
    for (const asset of MARKETPLACE_ASSETS) {
      expect(existsSync(resolve('public', asset.portraitPath.slice(1))), asset.assetId).toBe(true);
      expect(existsSync(resolve(asset.sourcePortraitPath)), `${asset.assetId} source`).toBe(true);
      expect(manifestIds.has(asset.assetId), `${asset.assetId} manifest`).toBe(true);
      expect(provenance).toContain(asset.assetId);
      expect(asset.runtimeIntegrated, asset.assetId).toBe(runtimeIds.has(asset.assetId));
      expect(asset.catalogStatus, asset.assetId).toBe(
        runtimeIds.has(asset.assetId) ? 'runtime-integrated' : 'preview-canonical',
      );
    }
  });

  it('keeps runtime selections linked and the icon sprite complete', () => {
    expect(manifest.scope.runtimeIntegration).toBe(true);
    expect(manifest.scope.assetOnly).toBe(false);
    const runtimeManifestIds = manifest.roles
      .flatMap((role) => role.variants)
      .filter((variant) => variant.runtimeIntegrated === true)
      .map((variant) => variant.assetId)
      .filter((assetId): assetId is string => typeof assetId === 'string');

    expect(new Set(runtimeManifestIds)).toEqual(new Set(MARKETPLACE_RUNTIME_ASSET_IDS));
    for (const asset of Object.values(MARKETPLACE_RUNTIME_ROLE_ASSETS)) {
      const runtimePath = resolve('public', asset.publicPath.slice(1));
      const sourcePath = resolve(asset.sourceSheetPath);

      expect(existsSync(runtimePath), asset.assetId).toBe(true);
      expect(existsSync(sourcePath), `${asset.assetId} source`).toBe(true);
      expect(sha256(runtimePath), `${asset.assetId} runtime/source hash`).toBe(
        sha256(sourcePath),
      );
    }
    expect(existsSync(resolve('public/assets/marketplace/icons/marketplace-icons.svg'))).toBe(true);
    expect(existsSync(resolve('public/assets/marketplace/icons/manifest.json'))).toBe(true);
    expect(MARKETPLACE_ICONS).toHaveLength(16);
  });
});
