import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { calculateLevelEffect, createInitialGameState, GameNumber, type GameState } from '../../src/core';
import {
  createSaveDocument,
  hasAnyProgress,
  reconcileGuestUpgrade,
  type SaveDocumentV1,
} from '../../src/persistence';

/**
 * Server-milestone Step 13/17: `hasAnyProgress` and `reconcileGuestUpgrade`
 * back both the guest-upgrade collision (Step 13's own required test: a
 * fresh identity link keeps everything, a genuine collision asks, a
 * progress-free guest is never asked) and Step 17's boot-time reconcile
 * (adopt a cloud save silently onto an otherwise-fresh local device).
 */
const TIMESTAMP_MS = 1_788_000_000_000;

function freshDocument(): SaveDocumentV1 {
  const state = createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS);
  return createSaveDocument(state, BASE_GAME_BALANCE, TIMESTAMP_MS);
}

function documentWithState(mutate: (state: GameState) => GameState): SaveDocumentV1 {
  const state = mutate(createInitialGameState(BASE_GAME_BALANCE, TIMESTAMP_MS));
  return createSaveDocument(state, BASE_GAME_BALANCE, TIMESTAMP_MS);
}

/** A validly-upgraded elevator: `capacity` must match the configured level effect, or `validateSaveDocument` rejects it. */
function upgradedElevator(state: GameState): { level: number; capacity: GameState['elevator']['capacity'] } {
  const level = state.elevator.level + 1;
  return {
    level,
    capacity: calculateLevelEffect(BASE_GAME_BALANCE.elevator.baseCapacity, level, BASE_GAME_BALANCE.elevator.upgrade),
  };
}

describe('hasAnyProgress', () => {
  it('is false for a freshly created state', () => {
    expect(hasAnyProgress(freshDocument(), BASE_GAME_BALANCE)).toBe(false);
  });

  it('is false when only gold has changed', () => {
    const document = documentWithState((state) => ({ ...state, gold: GameNumber.from(500) }));
    expect(hasAnyProgress(document, BASE_GAME_BALANCE)).toBe(false);
  });

  it('is false when only in-flight queues have material (transient idle churn)', () => {
    const document = documentWithState((state) => ({
      ...state,
      floors: state.floors.map((floor, index) =>
        index === 0 ? { ...floor, materialQueue: GameNumber.from(12) } : floor,
      ),
      elevator: { ...state.elevator, carriedMaterial: GameNumber.from(3) },
      warehouse: { ...state.warehouse, inputQueue: GameNumber.from(7) },
    }));
    expect(hasAnyProgress(document, BASE_GAME_BALANCE)).toBe(false);
  });

  it('is true when a floor has extracted material', () => {
    const document = documentWithState((state) => ({
      ...state,
      floors: state.floors.map((floor, index) =>
        index === 0 ? { ...floor, totalExtracted: GameNumber.from(1) } : floor,
      ),
    }));
    expect(hasAnyProgress(document, BASE_GAME_BALANCE)).toBe(true);
  });

  it('is true when a floor has been upgraded past its starting level', () => {
    const document = documentWithState((state) => ({
      ...state,
      floors: state.floors.map((floor, index) => (index === 0 ? { ...floor, mineShaftLevel: 2 } : floor)),
    }));
    expect(hasAnyProgress(document, BASE_GAME_BALANCE)).toBe(true);
  });

  it('is true when the elevator has been upgraded', () => {
    const document = documentWithState((state) => ({
      ...state,
      elevator: { ...state.elevator, ...upgradedElevator(state) },
    }));
    expect(hasAnyProgress(document, BASE_GAME_BALANCE)).toBe(true);
  });

  it('is true when the warehouse has delivered any gold', () => {
    const document = documentWithState((state) => ({
      ...state,
      warehouse: { ...state.warehouse, totalGoldDelivered: GameNumber.from(1) },
    }));
    expect(hasAnyProgress(document, BASE_GAME_BALANCE)).toBe(true);
  });
});

describe('reconcileGuestUpgrade', () => {
  const progressingDocument = documentWithState((state) => ({
    ...state,
    elevator: { ...state.elevator, ...upgradedElevator(state) },
  }));

  it('adopts local when the account has no cloud save at all (fresh identity link)', () => {
    const decision = reconcileGuestUpgrade(progressingDocument, null, BASE_GAME_BALANCE);
    expect(decision).toEqual({ kind: 'adopt-local' });
  });

  it('adopts remote silently when the guest has no progress, even if remote also has none', () => {
    const decision = reconcileGuestUpgrade(
      freshDocument(),
      { document: freshDocument(), receivedAtMs: TIMESTAMP_MS },
      BASE_GAME_BALANCE,
    );
    expect(decision).toEqual({ kind: 'adopt-remote' });
  });

  it('adopts remote silently when the guest has no progress and remote does', () => {
    const decision = reconcileGuestUpgrade(
      freshDocument(),
      { document: progressingDocument, receivedAtMs: TIMESTAMP_MS },
      BASE_GAME_BALANCE,
    );
    expect(decision).toEqual({ kind: 'adopt-remote' });
  });

  it('adopts local silently when local has progress and remote has none', () => {
    const decision = reconcileGuestUpgrade(
      progressingDocument,
      { document: freshDocument(), receivedAtMs: TIMESTAMP_MS },
      BASE_GAME_BALANCE,
    );
    expect(decision).toEqual({ kind: 'adopt-local' });
  });

  it('asks, with each candidate\'s document and last-played time, when both sides have progress', () => {
    const remoteDocument = documentWithState((state) => ({
      ...state,
      warehouse: { ...state.warehouse, totalGoldDelivered: GameNumber.from(42) },
    }));
    const remoteReceivedAtMs = TIMESTAMP_MS + 60_000;

    const decision = reconcileGuestUpgrade(
      progressingDocument,
      { document: remoteDocument, receivedAtMs: remoteReceivedAtMs },
      BASE_GAME_BALANCE,
    );

    expect(decision).toEqual({
      kind: 'ask',
      local: { document: progressingDocument, lastPlayedMs: progressingDocument.savedAtTimestampMs },
      remote: { document: remoteDocument, lastPlayedMs: remoteReceivedAtMs },
    });
  });
});
