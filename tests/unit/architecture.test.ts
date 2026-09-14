import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CORE_PROBE_PATH = 'src/core/architecture-probe.ts';
const LAYOUT_PROBE_PATH = 'src/game/layout/architecture-probe.ts';
const VIEW_MODEL_PROBE_PATH = 'src/game/view-model/architecture-probe.ts';
const RUNTIME_PROBE_PATH = 'src/game/runtime/architecture-probe.ts';

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

async function lintViewModel(source: string) {
  return lintProbe(source, VIEW_MODEL_PROBE_PATH);
}

async function lintRuntime(source: string) {
  return lintProbe(source, RUNTIME_PROBE_PATH);
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

  it('rejects the Deno/server runtime (Step 6)', async () => {
    const messages = await lintCore(`
      import { handleRequest } from '../../supabase/functions/save-sync/index.ts';
      import { createClient } from '@supabase/supabase-js';

      Deno.serve(handleRequest);
      createClient('', '');
    `);
    const restrictedImportMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-imports',
    );
    const restrictedGlobalMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-globals',
    );

    expect(restrictedImportMessages).toHaveLength(2);
    expect(restrictedGlobalMessages).toHaveLength(1);
  });

  it('rejects network APIs (Step 19: src/core must not learn a server exists)', async () => {
    const messages = await lintCore(`
      void fetch('https://example.test/save');
      new XMLHttpRequest();
      new WebSocket('wss://example.test');
      new EventSource('/events');
    `);
    const restrictedGlobalMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-globals',
    );

    expect(restrictedGlobalMessages).toHaveLength(4);
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

describe('view model boundary', () => {
  it('accepts pure TypeScript modules', async () => {
    const messages = await lintViewModel(`
      export function percent(value: number): string {
        return \`\${Math.round(value * 100)}%\`;
      }
    `);

    expect(messages).toEqual([]);
  });

  it('rejects renderer, adapter, and browser dependencies', async () => {
    const messages = await lintViewModel(`
      import Phaser from 'phaser';
      import { load } from '../../persistence/index.ts';

      document.title = Phaser.VERSION;
      window.postMessage(navigator.userAgent, load);
    `);
    const restrictedImportMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-imports',
    );
    const restrictedGlobalMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-globals',
    );

    expect(restrictedImportMessages).toHaveLength(2);
    expect(restrictedGlobalMessages).toHaveLength(3);
  });
});

describe('simulation driver boundary', () => {
  it('accepts pure TypeScript modules', async () => {
    const messages = await lintRuntime(`
      export function elapsed(now: number, since: number): number {
        return now - since;
      }
    `);

    expect(messages).toEqual([]);
  });

  it('rejects renderer, adapter, and browser dependencies', async () => {
    const messages = await lintRuntime(`
      import Phaser from 'phaser';
      import { load } from '../../persistence/index.ts';

      document.title = Phaser.VERSION;
      window.postMessage(navigator.userAgent, load);
    `);
    const restrictedImportMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-imports',
    );
    const restrictedGlobalMessages = messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-globals',
    );

    expect(restrictedImportMessages).toHaveLength(2);
    expect(restrictedGlobalMessages).toHaveLength(3);
  });
});
