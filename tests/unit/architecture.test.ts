import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CORE_PROBE_PATH = 'src/core/architecture-probe.ts';

async function lintCore(source: string) {
  const eslint = new ESLint({ cwd: PROJECT_ROOT });
  const [result] = await eslint.lintText(source, {
    filePath: CORE_PROBE_PATH,
  });

  return result.messages;
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
