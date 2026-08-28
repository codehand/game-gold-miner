import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const INDEX_URL = new URL('../../index.html', import.meta.url);

describe('application scaffold', () => {
  it('provides the English metadata and TypeScript application entry point', async () => {
    const document = await readFile(INDEX_URL, 'utf8');

    expect(document).toContain('<html lang="en">');
    expect(document).toContain('<title>Cat Mine Idle</title>');
    expect(document).toContain('<main id="app">');
    expect(document).toContain('<div id="game-viewport"');
    expect(document).toContain('src="/src/main.ts"');
  });

  it('opts into safe-area insets for the portrait layout', async () => {
    const document = await readFile(INDEX_URL, 'utf8');

    expect(document).toContain('viewport-fit=cover');
  });
});
