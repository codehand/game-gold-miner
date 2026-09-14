import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import {
  calculateLevelEffect,
  claimOfflineReward,
  createInitialGameState,
  GameNumber,
  type GameState,
} from '../../src/core';
import {
  compareProgress,
  createSaveDocument,
  describeSaveConflictCandidate,
  resolveSaveConflict,
  type SaveDocumentV2,
} from '../../src/persistence';

/**
 * Server-milestone Step 18: the §7 conflict policy. `compareProgress` is the
 * dominance predicate over the §7.1 progress vector; `resolveSaveConflict`
 * applies §7's three cases; `describeSaveConflictCandidate` produces the §7.3
 * fields a genuine fork shows the player.
 *
 * Every fixture is built through the real `createSaveDocument`, so these tests
 * can only exercise documents `validateSaveDocument` would accept — a capacity
 * that did not match its level, or a locked floor carrying production, fails
 * here exactly as it would in production.
 */
const TIMESTAMP_MS = 1_788_000_000_000;

function freshDocument(savedAtTimestampMs = TIMESTAMP_MS): SaveDocumentV2 {
  const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, savedAtTimestampMs);
}

function documentWithState(mutate: (state: GameState) => GameState): SaveDocumentV2 {
  const state = mutate(createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS));
  return createSaveDocument(state, BASE_GAME_BALANCE, TIMESTAMP_MS);
}

/** A save holding a real claimed offline reward, built through the core claim function so the counter moves with `gold`. */
function claimedOfflineDocument(reward = 1_000_000): SaveDocumentV2 {
  return documentWithState((state) =>
    claimOfflineReward(state, {
      creditedDurationMs: 60_000,
      reward: GameNumber.from(reward),
    }).state,
  );
}

/** A validly-upgraded elevator: `capacity` must match the configured level effect, or `validateSaveDocument` rejects it. */
function upgradedElevator(state: GameState, bump = 1): { level: number; capacity: GameState['elevator']['capacity'] } {
  const level = state.elevator.level + bump;
  return {
    level,
    capacity: calculateLevelEffect(BASE_GAME_BALANCE.elevator.baseCapacity, level, BASE_GAME_BALANCE.elevator.upgrade),
  };
}

function upgradedWarehouse(state: GameState, bump = 1): { level: number; capacity: GameState['warehouse']['capacity'] } {
  const level = state.warehouse.level + bump;
  return {
    level,
    capacity: calculateLevelEffect(BASE_GAME_BALANCE.warehouse.baseCapacity, level, BASE_GAME_BALANCE.warehouse.upgrade),
  };
}

describe('compareProgress (§7.1 dominance over the progress vector)', () => {
  it('is equal for two fresh documents', () => {
    expect(compareProgress(freshDocument(), freshDocument())).toBe('equal');
  });

  it('is equal when only excluded fields differ — gold, queues, progress fractions, timestamps', () => {
    const withTransientState = documentWithState((state) => ({
      ...state,
      gold: GameNumber.from(500),
      simulationTick: 9_999,
      floors: state.floors.map((floor, index) =>
        index === 0
          ? { ...floor, materialQueue: GameNumber.from(12), extractionProgress: 0.5 }
          : floor,
      ),
      elevator: { ...state.elevator, carriedMaterial: GameNumber.from(3), roundRobinCursor: 2, transitProgress: 0.7 },
      warehouse: { ...state.warehouse, inputQueue: GameNumber.from(7), conversionProgress: 0.4 },
    }));

    // The timestamps are excluded too: `savedAtTimestampMs` is the only thing
    // that differs between these two documents, and it changes nothing.
    const laterSavedAt = freshDocument(TIMESTAMP_MS + 5_000);

    expect(compareProgress(withTransientState, freshDocument())).toBe('equal');
    expect(compareProgress(freshDocument(), withTransientState)).toBe('equal');
    expect(compareProgress(laterSavedAt, freshDocument())).toBe('equal');
  });

  it('reports left-dominates when left is a strict superset', () => {
    const upgraded = documentWithState((state) => ({
      ...state,
      elevator: { ...state.elevator, ...upgradedElevator(state) },
    }));

    expect(compareProgress(upgraded, freshDocument())).toBe('left-dominates');
    expect(compareProgress(freshDocument(), upgraded)).toBe('right-dominates');
  });

  it('counts an unlocked floor above a locked one (false < true)', () => {
    const unlockedSecondFloor = documentWithState((state) => ({
      ...state,
      floors: state.floors.map((floor, index) => {
        if (index === 0) {
          return { ...floor, mineShaftLevel: BASE_GAME_BALANCE.floors[1].unlockRequirement?.level ?? 5 };
        }
        if (index === 1) {
          return { ...floor, isUnlocked: true };
        }
        return floor;
      }),
    }));

    expect(compareProgress(unlockedSecondFloor, freshDocument())).toBe('left-dominates');
  });

  it('counts cumulative per-floor counters, even while the floor stays locked-out of the comparison in no other way', () => {
    const extracted = documentWithState((state) => ({
      ...state,
      floors: state.floors.map((floor, index) =>
        index === 0 ? { ...floor, totalExtracted: GameNumber.from(25), totalTransported: GameNumber.from(10) } : floor,
      ),
    }));

    expect(compareProgress(extracted, freshDocument())).toBe('left-dominates');
  });

  it('is a fork when each side holds progress the other lacks', () => {
    const higherElevator = documentWithState((state) => ({
      ...state,
      elevator: { ...state.elevator, ...upgradedElevator(state) },
    }));
    const higherWarehouse = documentWithState((state) => ({
      ...state,
      warehouse: { ...state.warehouse, ...upgradedWarehouse(state) },
    }));

    expect(compareProgress(higherElevator, higherWarehouse)).toBe('fork');
    expect(compareProgress(higherWarehouse, higherElevator)).toBe('fork');
  });
});

describe('describeSaveConflictCandidate (§7.3 display fields)', () => {
  it('reads gold, floors open, deepest shaft level, total delivered, and last played', () => {
    const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
    const unlockLevel = BASE_GAME_BALANCE.floors[1].unlockRequirement?.level ?? 5;
    const document = createSaveDocument(
      {
        ...state,
        gold: GameNumber.from(1234),
        floors: state.floors.map((floor, index) => {
          if (index === 0) {
            return { ...floor, mineShaftLevel: unlockLevel };
          }
          if (index === 1) {
            return { ...floor, isUnlocked: true, mineShaftLevel: 7 };
          }
          return floor;
        }),
        warehouse: { ...state.warehouse, totalGoldDelivered: GameNumber.from(9876) },
      },
      BASE_GAME_BALANCE,
      TIMESTAMP_MS,
    );

    const candidate = describeSaveConflictCandidate(document, TIMESTAMP_MS + 60_000);

    expect(candidate.document).toBe(document);
    expect(candidate.lastPlayedMs).toBe(TIMESTAMP_MS + 60_000);
    expect(candidate.gold.serialize()).toBe(GameNumber.from(1234).serialize());
    expect(candidate.floorsOpen).toBe(2);
    expect(candidate.deepestShaftLevel).toBe(7);
    expect(candidate.totalGoldDelivered.serialize()).toBe(GameNumber.from(9876).serialize());
  });

  it('reports a fresh document as one floor open at the starting level', () => {
    const candidate = describeSaveConflictCandidate(freshDocument(), TIMESTAMP_MS);

    expect(candidate.floorsOpen).toBe(1);
    expect(candidate.deepestShaftLevel).toBe(BASE_GAME_BALANCE.floors[0].startingLevel);
  });
});

describe('resolveSaveConflict (§7 policy)', () => {
  const progressingDocument = documentWithState((state) => ({
    ...state,
    elevator: { ...state.elevator, ...upgradedElevator(state) },
  }));

  it('keeps local when the account has no cloud save at all (fresh identity link)', () => {
    expect(resolveSaveConflict(progressingDocument, null)).toEqual({ kind: 'local-dominates' });
  });

  it('reports same-progress when the vectors are equal', () => {
    expect(
      resolveSaveConflict(freshDocument(), { document: freshDocument(), receivedAtMs: TIMESTAMP_MS }),
    ).toEqual({ kind: 'same-progress' });
  });

  it('reports same-progress for a document compared against itself (2026-09-13 review)', () => {
    // A save holding an offline reward, compared to itself, has an equal vector
    // (the counter is in it) and equal gold — it must not be handed to the
    // chooser as two byte-identical candidates.
    const document = claimedOfflineDocument();
    expect(
      resolveSaveConflict(document, { document, receivedAtMs: TIMESTAMP_MS }),
    ).toEqual({ kind: 'same-progress' });
  });

  it('keeps local silently when local is a strict superset of the cloud save', () => {
    expect(
      resolveSaveConflict(progressingDocument, { document: freshDocument(), receivedAtMs: TIMESTAMP_MS }),
    ).toEqual({ kind: 'local-dominates' });
  });

  it('adopts the cloud save silently when it is a strict superset of local', () => {
    expect(
      resolveSaveConflict(freshDocument(), { document: progressingDocument, receivedAtMs: TIMESTAMP_MS }),
    ).toEqual({ kind: 'remote-dominates' });
  });

  it('asks, with both §7.3 candidates and their own last-played times, on a genuine fork', () => {
    const remoteDocument = documentWithState((state) => ({
      ...state,
      warehouse: { ...state.warehouse, ...upgradedWarehouse(state) },
    }));
    const remoteReceivedAtMs = TIMESTAMP_MS + 60_000;

    const resolution = resolveSaveConflict(progressingDocument, {
      document: remoteDocument,
      receivedAtMs: remoteReceivedAtMs,
    });

    expect(resolution.kind).toBe('fork');
    if (resolution.kind !== 'fork') {
      throw new Error('expected a fork');
    }

    // The local candidate's document is the local one verbatim, and its
    // last-played is the document's own saved-at — never the server's clock.
    expect(resolution.local.document).toBe(progressingDocument);
    expect(resolution.local.lastPlayedMs).toBe(progressingDocument.savedAtTimestampMs);
    expect(resolution.remote.document).toBe(remoteDocument);
    expect(resolution.remote.lastPlayedMs).toBe(remoteReceivedAtMs);
  });
});

describe('resolveSaveConflict — offline gold is a vector field (2026-09-13 review)', () => {
  // `claimOfflineReward` credits `warehouse.totalOfflineGoldClaimed` alongside
  // `gold`, so the vector counts every gold source and no `gold` special-case
  // is needed. The earlier heuristic was also dead in real play — `gold` falls
  // with spending while its bound only grew — so these fixtures use a realistic
  // lifetime `totalGoldDelivered`, not a fresh state.
  const playedOfflineDocument = documentWithState((state) => {
    const played: GameState = {
      ...state,
      floors: state.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              mineShaftLevel: 5,
              totalExtracted: GameNumber.from(50_000),
              totalTransported: GameNumber.from(50_000),
            }
          : floor,
      ),
      warehouse: {
        ...state.warehouse,
        totalGoldDelivered: GameNumber.from(50_000),
      },
      gold: GameNumber.from(1_600),
    };

    return claimOfflineReward(played, {
      creditedDurationMs: 60_000,
      reward: GameNumber.from(500),
    }).state;
  });

  const higherProgressDocument = documentWithState((state) => ({
    ...state,
    floors: state.floors.map((floor, index) =>
      index === 0
        ? {
            ...floor,
            mineShaftLevel: 6,
            totalExtracted: GameNumber.from(50_000),
            totalTransported: GameNumber.from(50_000),
          }
        : floor,
    ),
    warehouse: {
      ...state.warehouse,
      ...upgradedWarehouse(state),
      totalGoldDelivered: GameNumber.from(50_000),
    },
  }));

  it('forks a played-and-claimed save against one with higher progress and no claim', () => {
    // Reproduces the original HIGH finding with realistic totals: the old
    // `gold`-bound heuristic saw `1_600 <= 100 + 50_000` and silently adopted
    // the higher-progress save, destroying the 500 gold the player just
    // claimed. With the counter in the vector, neither dominates.
    expect(
      resolveSaveConflict(playedOfflineDocument, {
        document: higherProgressDocument,
        receivedAtMs: TIMESTAMP_MS,
      }),
    ).toMatchObject({ kind: 'fork' });
  });

  it('reports a fork on the raw progress comparison too', () => {
    expect(compareProgress(playedOfflineDocument, higherProgressDocument)).toBe('fork');
    expect(compareProgress(higherProgressDocument, playedOfflineDocument)).toBe('fork');
  });

  it('reports same-progress for two identical played-and-claimed saves', () => {
    expect(
      resolveSaveConflict(playedOfflineDocument, {
        document: playedOfflineDocument,
        receivedAtMs: TIMESTAMP_MS,
      }),
    ).toEqual({ kind: 'same-progress' });
  });
});

describe('compareProgress — malformed input (2026-09-13 review, MEDIUM)', () => {
  it('reports a fork instead of throwing when the two floor counts differ', () => {
    const fresh = freshDocument();
    // Deliberately bypasses `validateSaveDocument` to model a caller that
    // passed an unvalidated `409` body straight in: a raw `TypeError` out of
    // a pure predicate is exactly the failure this guard prevents.
    const shortDocument = {
      ...fresh,
      state: { ...fresh.state, floors: fresh.state.floors.slice(0, 14) },
    } as SaveDocumentV2;

    expect(compareProgress(fresh, shortDocument)).toBe('fork');
    expect(compareProgress(shortDocument, fresh)).toBe('fork');
  });
});
