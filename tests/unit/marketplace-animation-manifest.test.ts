import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface ManifestVariant {
  assetId?: string;
  grid?: string;
  frameCount?: number;
  frameSize?: string;
  frameDurationMs?: number;
  rawCandidate?: string;
  transparentSheet?: string;
  animationPreview?: string;
}

const manifest = JSON.parse(
  readFileSync(resolve('art-source/cat-role-catalog/asset-manifest.json'), 'utf8'),
) as { roles: Array<{ variants: ManifestVariant[] }> };

const PREMIUM_ASSET_IDS = [
  'elevator-cargo-cat:SSR:mofy:idle',
  'elevator-cargo-cat:SSR:win:idle',
  'elevator-cargo-cat:SSR:elon:idle',
  'warehouse-manager:SR:baron:idle',
  'warehouse-manager:SR:cipher:idle',
  'warehouse-manager:SR:gauge:idle',
  'warehouse-manager:SSR:nautilus:idle',
  'miner:SSR:forge:idle',
] as const;

describe('Marketplace premium animation manifest', () => {
  it('keeps every v1 premium family on the exact 4x2/8-frame contract', () => {
    const variants = new Map(
      manifest.roles
        .flatMap((role) => role.variants)
        .filter((variant): variant is ManifestVariant & { assetId: string } => (
          typeof variant.assetId === 'string'
        ))
        .map((variant) => [variant.assetId, variant]),
    );

    for (const assetId of PREMIUM_ASSET_IDS) {
      const variant = variants.get(assetId);
      expect(variant, assetId).toBeDefined();
      expect(variant?.grid, assetId).toBe('4x2');
      expect(variant?.frameCount, assetId).toBe(8);
      expect(variant?.frameSize, assetId).toBe('128x128');
      expect(variant?.frameDurationMs, assetId).toBe(110);
      expect(existsSync(resolve(variant?.rawCandidate ?? '')), `${assetId} raw`).toBe(true);
      expect(existsSync(resolve(variant?.transparentSheet ?? '')), `${assetId} sheet`).toBe(true);
      expect(existsSync(resolve(variant?.animationPreview ?? '')), `${assetId} animation`).toBe(true);
    }
  });

  it('keeps the dedicated Miner baseline on the separate 2x2/4-frame contract', () => {
    const mica = manifest.roles
      .flatMap((role) => role.variants)
      .find((variant) => variant.assetId === 'miner:N:mica:idle');

    expect(mica).toEqual(expect.objectContaining({
      grid: '2x2',
      frameCount: 4,
      frameSize: '128x128',
      frameDurationMs: 220,
    }));
  });
});
