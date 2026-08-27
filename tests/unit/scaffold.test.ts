import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const INDEX_URL = new URL('../../index.html', import.meta.url);

describe('application scaffold', () => {
  it('provides the English metadata and TypeScript application entry point', async () => {
    const document = await readFile(INDEX_URL, 'utf8');

    expect(document).toContain('<html lang="en">');
    expect(document).toContain('<title>Cat Mine Idle</title>');
    expect(document).toContain('<main id="app"></main>');
    expect(document).toContain('src="/src/main.ts"');
  });
});
