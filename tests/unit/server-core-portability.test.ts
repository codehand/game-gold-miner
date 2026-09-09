import { describe, expect, it } from 'vitest';

import { BASE_GAME_BALANCE } from '../../src/config';
import { advanceSimulation, catchUpSimulation, SIMULATION_STEP_MS } from '../../src/core';
import {
  createSaveDocument,
  deserializeSaveDocument,
  migrateSaveDocument,
  validateSaveDocument,
} from '../../src/persistence';
import tenMinuteFixture from '../fixtures/ten-minute-core-fixture.json';

/**
 * Server-milestone Step 6: "An Edge Function imports the real
 * `advanceSimulation`, `catchUpSimulation`, `migrateSaveDocument`, and
 * `validateSaveDocument`, and reproduces a known ten-minute result
 * byte-for-byte identical to the client unit test's expectation."
 *
 * This is that client unit test. It runs the identical sequence against the
 * unbundled source every other unit test imports, over the same fixed input
 * document `supabase/functions/core-portability-check/index.ts` reads from
 * `tests/fixtures/ten-minute-core-fixture.json`, and pins the result. The
 * Edge Function's half of the proof — that its bundled copy of the same
 * source produces this exact document too — is `npm run verify:server`'s
 * "Edge Function reproduces the ten-minute core fixture" check, run against
 * the live local stack rather than here, because that is where "the real
 * Deno runtime ran this" can actually be demonstrated.
 *
 * Mutating a core file changes both results together: a change to
 * `advanceSimulation`, `catchUpSimulation`, `migrateSaveDocument`, or
 * `validateSaveDocument` breaks this pinned assertion, and — because
 * `npm run build:server-core` regenerates the Edge Function's bundle from the
 * same source before every `npm run verify:server` run — the live function's
 * response moves with it rather than staying frozen on stale behavior.
 */
describe('server core portability (Step 6)', () => {
  it('reproduces the pinned ten-minute fixture through the real save-document and simulation functions', () => {
    const { inputDocument, tenMinutesMs, expectedOutputDocument } = tenMinuteFixture;

    const migrated = migrateSaveDocument(inputDocument, BASE_GAME_BALANCE);
    const validated = validateSaveDocument(migrated, BASE_GAME_BALANCE);
    const loaded = deserializeSaveDocument(validated, BASE_GAME_BALANCE);

    const advancedByOneTick = advanceSimulation(loaded.state, SIMULATION_STEP_MS);
    const finalState = catchUpSimulation(
      advancedByOneTick,
      tenMinutesMs - SIMULATION_STEP_MS,
    );

    const outputDocument = createSaveDocument(
      finalState,
      BASE_GAME_BALANCE,
      inputDocument.savedAtTimestampMs + tenMinutesMs,
    );

    expect(outputDocument).toEqual(expectedOutputDocument);
    // Pinned by hand as a sanity check on the fixture itself, not derived from
    // it: ten minutes of an unlocked floor 1 alone, capped by the warehouse's
    // slower cycle, delivers 2,980 gold on top of the starting 100.
    expect(outputDocument.state.gold).toBe('3080');
  });
});
