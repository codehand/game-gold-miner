import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CORE_PROBE_PATH = 'src/core/architecture-probe.ts';
const LAYOUT_PROBE_PATH = 'src/game/layout/architecture-probe.ts';

async function lintProbe(source: string, filePath: string) {
  const eslint = new ESLint({ cwd: PROJECT_ROOT });
  const [result] = await eslint.lintText(source, { filePath });

  return result.messages;
}

async function lintCore(source: string) {
  return lintProbe(source, CORE_PROBE_PATH);
}

async function lintLayout(source: string) {
  return lintProbe(source, LAYOUT_PROBE_PATH);
}

describe('core architecture boundary', () => {
  it('accepts pure TypeScript modules', async () => {
    const messages = await lintCore(`
      export function add(left: number, right: number): number {
        return left + right;
      }
    `);

    expect(messages).toEqual([]);
  });

  it('rejects renderer, adapter, and browser dependencies', async () => {
    const messages = await lintCore(`
      import Phaser from 'phaser';
      import type { SaveAdapter } from '../persistence/save-adapter.ts';
      import { createPlatform } from '../platform/web/index.ts';

      document.title = Phaser.VERSION;
      window.postMessage(createPlatform satisfies SaveAdapter, '*');
    `);
    const restrictedImportMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-imports',
    );
    const restrictedGlobalMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-globals',
    );

    expect(restrictedImportMessages).toHaveLength(3);
    expect(restrictedGlobalMessages).toHaveLength(2);
  });
});

describe('layout geometry boundary', () => {
  it('accepts pure TypeScript modules', async () => {
    const messages = await lintLayout(`
      export function double(value: number): number {
        return value * 2;
      }
    `);

    expect(messages).toEqual([]);
  });

  it('rejects renderer and browser dependencies', async () => {
    const messages = await lintLayout(`
      import Phaser from 'phaser';

      document.title = Phaser.VERSION;
      window.postMessage(navigator.userAgent, '*');
    `);
    const restrictedImportMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-imports',
    );
    const restrictedGlobalMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-globals',
    );

    expect(restrictedImportMessages).toHaveLength(1);
    expect(restrictedGlobalMessages).toHaveLength(3);
  });
});
