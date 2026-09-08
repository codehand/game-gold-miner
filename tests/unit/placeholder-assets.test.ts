import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PLACEHOLDER_ANIMATION_ASSETS,
  PLACEHOLDER_ANIMATION_FRAME_COUNT,
  PLACEHOLDER_ANIMATION_FRAME_SIZE,
  PLACEHOLDER_ANIMATION_TEXTURES,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_TEXTURES,
} from '../../src/game/assets/placeholderAssets';

interface PlaceholderAssetRecord {
  readonly id: string;
  readonly path: string;
  readonly size: string;
  readonly role: string;
  readonly status: string;
}

interface PlaceholderAssetManifest {
  readonly family: string;
  readonly rights: {
    readonly externalBranding: boolean;
    readonly thirdPartyAssets: boolean;
  };
  readonly assets: readonly PlaceholderAssetRecord[];
  readonly animationAssets: readonly {
    readonly id: string;
    readonly frameCount: number;
    readonly status: string;
    readonly qc: {
      readonly emptyFrames: number;
      readonly outputEdgeTouchFrames: number;
      readonly pasteClampedFrames: number;
    };
  }[];
}

const PNG_SIGNATURE = '89504e470d0a1a0a';

describe('Step 32 original placeholder assets', () => {
  it('publishes one semantic runtime file for every generated texture key', () => {
    expect(PLACEHOLDER_ASSETS).toHaveLength(
      Object.keys(PLACEHOLDER_TEXTURES).length,
    );
    expect(new Set(PLACEHOLDER_ASSETS.map(([key]) => key)).size).toBe(
      PLACEHOLDER_ASSETS.length,
    );
  });

  it('keeps every runtime sprite as a valid RGBA PNG at its recorded size', () => {
    const pack = JSON.parse(
      readFileSync(resolve('public/assets/step-32a/asset-manifest.json'), 'utf8'),
    ) as PlaceholderAssetManifest;
    const recordedSizes = new Map(
      pack.assets.map((asset) => [
        `/${asset.path.replace(/^public\//, '')}`,
        asset.size.split('x').map(Number),
      ]),
    );

    for (const [, publicPath] of PLACEHOLDER_ASSETS) {
      const bytes = readFileSync(resolve('public', publicPath.slice(1)));
      const [expectedWidth, expectedHeight] = recordedSizes.get(publicPath) ?? [128, 128];

      expect(bytes.subarray(0, 8).toString('hex'), publicPath).toBe(
        PNG_SIGNATURE,
      );
      expect(bytes.readUInt32BE(16), `${publicPath} width`).toBe(expectedWidth);
      expect(bytes.readUInt32BE(20), `${publicPath} height`).toBe(expectedHeight);
      expect([2, 6], `${publicPath} must use RGB or RGBA color type`).toContain(
        bytes[25],
      );
    }
  });

  it('records generated provenance and excludes third-party branding', () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve('public/assets/placeholder/asset-manifest.json'),
        'utf8',
      ),
    ) as PlaceholderAssetManifest;

    expect(manifest.family).toBe('step-32-original-placeholder-presentation');
    expect(manifest.rights.thirdPartyAssets).toBe(false);
    expect(manifest.rights.externalBranding).toBe(false);
    expect(manifest.assets).toHaveLength(9);
    expect(manifest.assets.every((asset) => {
      return asset.status === 'step-32-placeholder' && asset.size === '128x128';
    })).toBe(true);
    expect(manifest.animationAssets).toHaveLength(3);
    expect(manifest.animationAssets.every((asset) => {
      return (
        asset.status === 'step-32a-animation-pack' &&
        asset.frameCount === PLACEHOLDER_ANIMATION_FRAME_COUNT &&
        asset.qc.emptyFrames === 0 &&
        asset.qc.outputEdgeTouchFrames === 0 &&
        asset.qc.pasteClampedFrames === 0
      );
    })).toBe(true);

    const pack = JSON.parse(
      readFileSync(resolve('public/assets/step-32a/asset-manifest.json'), 'utf8'),
    ) as PlaceholderAssetManifest;

    expect(pack.family).toBe('step-32a-layout1-production-pack');
    expect(pack.assets).toHaveLength(10);
    expect(pack.assets).toContainEqual(
      expect.objectContaining({
        id: 'elevator-tower',
        size: '512x512',
        role: expect.stringContaining('gold hopper'),
      }),
    );
    expect(pack.assets).toContainEqual(
      expect.objectContaining({
        id: 'elevator-tower-empty',
        size: '512x512',
        role: expect.stringContaining('warehouse.inputQueue is zero'),
      }),
    );
    expect(pack.assets).toContainEqual(
      expect.objectContaining({
        id: 'surface-landscape',
        size: '720x328',
        role: expect.stringContaining('blue-sky'),
      }),
    );
    expect(pack.assets).toContainEqual(
      expect.objectContaining({
        id: 'warehouse-building',
        size: '512x512',
        role: expect.stringContaining('loading bay'),
      }),
    );
    expect(pack.animationAssets).toHaveLength(6);
    expect(pack.animationAssets).toContainEqual(
      expect.objectContaining({
        id: 'warehouse-manager-idle-sheet',
        frameCount: 4,
        role: expect.stringContaining('supervisor cat'),
      }),
    );
    expect(pack.animationAssets).toContainEqual(
      expect.objectContaining({
        id: 'surface-hauler-cat-sheet',
        frameCount: 4,
        role: expect.stringContaining('delivery cart'),
      }),
    );
    expect(pack.animationAssets).toContainEqual(
      expect.objectContaining({
        id: 'surface-gold-pour-sheet',
        frameCount: 4,
        role: expect.stringContaining('cart loads'),
      }),
    );
    expect(pack.animationAssets.every((asset) => {
      return (
        asset.frameCount === PLACEHOLDER_ANIMATION_FRAME_COUNT &&
        asset.qc.emptyFrames === 0 &&
        asset.qc.outputEdgeTouchFrames === 0 &&
        asset.qc.pasteClampedFrames === 0
      );
    })).toBe(true);
  });

  it('ships every strict 4-frame animation sheet used by Step 32A', () => {
    expect(PLACEHOLDER_ANIMATION_ASSETS).toHaveLength(
      Object.keys(PLACEHOLDER_ANIMATION_TEXTURES).length,
    );

    for (const [, publicPath] of PLACEHOLDER_ANIMATION_ASSETS) {
      const bytes = readFileSync(resolve('public', publicPath.slice(1)));

      expect(bytes.subarray(0, 8).toString('hex'), publicPath).toBe(
        PNG_SIGNATURE,
      );
      expect(bytes.readUInt32BE(16), `${publicPath} width`).toBe(
        PLACEHOLDER_ANIMATION_FRAME_SIZE * 2,
      );
      expect(bytes.readUInt32BE(20), `${publicPath} height`).toBe(
        PLACEHOLDER_ANIMATION_FRAME_SIZE * 2,
      );
      expect(bytes[25], `${publicPath} must use RGBA color type`).toBe(6);
    }

    expect(PLACEHOLDER_ANIMATION_FRAME_COUNT).toBe(4);
  });
});
