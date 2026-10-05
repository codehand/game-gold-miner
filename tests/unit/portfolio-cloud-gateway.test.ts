import { describe, expect, it } from 'vitest';

import { createInitialPortfolio } from '../../src/core';
import { createPortfolioSaveDocument } from '../../src/persistence';
import { PortfolioCloudGateway } from '../../src/platform/web';

const DOCUMENT = createPortfolioSaveDocument(createInitialPortfolio(1_000), 1_000);

function auth() {
  return {
    getSession: async () => ({ data: { session: { access_token: 'first' } }, error: null }),
    refreshSession: async () => ({ data: { session: { access_token: 'renewed' } }, error: null }),
  };
}

describe('PortfolioCloudGateway', () => {
  it('returns the server canonical document for an upload and uses the command route', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const gateway = new PortfolioCloudGateway('https://example.test/save-sync/', auth(), async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method ?? '',
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        status: 'applied', revision: calls.length, receivedAt: '2026-10-02T00:00:00.000Z',
        document: DOCUMENT, result: { type: 'purchase', mineId: 'amethyst' },
      });
    });

    const uploaded = await gateway.upload(null, DOCUMENT);
    expect(uploaded.kind).toBe('ok');
    if (uploaded.kind !== 'ok') return;
    expect(uploaded.value.document).toEqual(DOCUMENT);
    const command = await gateway.command({
      type: 'purchase', mineId: 'amethyst', baseRevision: 1,
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(command.kind).toBe('ok');
    expect(calls[0]).toMatchObject({
      url: 'https://example.test/save-sync/v1/save', method: 'PUT',
      body: { baseRevision: null, document: DOCUMENT },
    });
    expect(calls[1]).toMatchObject({
      url: 'https://example.test/save-sync/v1/portfolio/command', method: 'POST',
      body: { type: 'purchase', mineId: 'amethyst', baseRevision: 1 },
    });
  });

  it('refreshes an expired token once and keeps conflict details', async () => {
    const tokens: string[] = [];
    const gateway = new PortfolioCloudGateway('https://example.test/save-sync', auth(), async (_input, init) => {
      tokens.push(String((init?.headers as Record<string, string>).authorization));
      return tokens.length === 1
        ? Response.json({ error: { code: 'unauthenticated' } }, { status: 401 })
        : Response.json({ error: { code: 'revision_conflict', detail: {
          serverRevision: 4, document: DOCUMENT,
        } } }, { status: 409 });
    });
    const result = await gateway.command({
      type: 'suspend', baseRevision: 3,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    });
    expect(tokens).toEqual(['Bearer first', 'Bearer renewed']);
    expect(result).toEqual({ kind: 'conflict', revision: 4, document: DOCUMENT });
  });

  it('distinguishes a missing cloud save from a network failure', async () => {
    const missing = new PortfolioCloudGateway('https://example.test/save-sync', auth(), async () =>
      new Response(null, { status: 204 }));
    expect(await missing.download()).toEqual({ kind: 'missing' });
    const offline = new PortfolioCloudGateway('https://example.test/save-sync', auth(), async () => {
      throw new Error('offline');
    });
    expect(await offline.download()).toEqual({
      kind: 'unavailable', reason: 'request-failed:offline',
    });
  });
});
