import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { createInitialGameState } from '../../src/core';
import { createSaveDocument, loadActiveGame, type SaveDocumentV2 } from '../../src/persistence';

const NOW_MS = 1_757_000_000_000;
const CAT_ROSTER = {
  cats: [{
    catInstanceId: 'cat-1',
    ownerUserId: 'user-1',
    assetId: 'miner:SSR:forge:idle',
    displayName: 'Forge',
    roleId: 'miner' as const,
    rarityTier: 'SSR' as const,
    level: 1,
    attributes: { power: 92, speed: 79, capacity: 72, efficiency: 86 },
    calculationVersion: 1,
    availabilityState: 'Assigned' as const,
    assignedSlotKey: 'miner:floor-1' as const,
    updatedAt: NOW_MS,
  }],
  assignments: [{ slotKey: 'miner:floor-1' as const, catInstanceId: 'cat-1' }],
  assignmentRevision: 2,
  collectionRevision: 3,
};

describe('active-game cat hydration', () => {
  it('returns the saved roster and preserves it when settling offline income', async () => {
    const document = createSaveDocument(
      createInitialGameState(BASE_GAME_BALANCE, NOW_MS),
      BASE_GAME_BALANCE,
      NOW_MS,
      CAT_ROSTER,
    );
    let queued: SaveDocumentV2 | null = null;

    const result = await loadActiveGame(
      {
        loadActiveSave: async () => document,
        queueSave: (next) => { queued = next; },
        flush: async () => true,
      },
      BASE_GAME_BALANCE,
      NOW_MS,
    );

    expect(result.source).toBe('saved');
    expect(result.catRoster).toEqual(CAT_ROSTER);
    const queuedDocument = queued as unknown as SaveDocumentV2;
    expect(queuedDocument.cats).toEqual(document.cats);
    expect(queuedDocument.assignments).toEqual(document.assignments);
    expect(queuedDocument.assignmentRevision).toBe(2);
    expect(queuedDocument.collectionRevision).toBe(3);
  });
});
