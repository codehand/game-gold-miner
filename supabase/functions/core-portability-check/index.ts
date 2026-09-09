/**
 * `core-portability-check` Edge Function — server-milestone Step 6.
 *
 * Not part of the save-sync protocol and not player-reachable in any
 * meaningful sense: its only job is to prove, on the real local edge runtime,
 * that `src/core`, `src/config`, and the save-document boundary
 * (`src/persistence/saveSchema.ts`) run here unmodified. It imports the
 * generated bundle at `../_shared/generated/core-bundle.js`
 * (`npm run build:server-core`, from `supabase/functions/_shared/coreBundleEntry.ts`
 * — see that file for why a bundle rather than a raw relative import), reads
 * the same fixed input document `tests/unit/server-core-portability.test.ts`
 * uses, runs it through the real `migrateSaveDocument`, `validateSaveDocument`,
 * `advanceSimulation`, and `catchUpSimulation`, and returns the resulting
 * document for that test — or `scripts/verify-server-stack.mjs`, against the
 * live stack — to compare byte-for-byte against the pinned expectation.
 *
 * `verify_jwt = false` in `supabase/config.toml`: this reads and writes no
 * data, so it needs no more protection than the health route already has.
 * Response envelope from `../_shared/http.ts` (server-milestone Step 7).
 */
import ten_minute_fixture from '../../../tests/fixtures/ten-minute-core-fixture.json' with { type: 'json' };
import {
  advanceSimulation,
  BASE_GAME_BALANCE,
  catchUpSimulation,
  createSaveDocument,
  deserializeSaveDocument,
  migrateSaveDocument,
  SIMULATION_STEP_MS,
  validateSaveDocument,
} from '../_shared/generated/core-bundle.js';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

/**
 * The exact ten-minute reproduction: migrate and validate the fixture's input
 * document, deserialize it into authoritative state, advance one explicit
 * fixed tick through `advanceSimulation`, then walk the remaining elapsed time
 * through `catchUpSimulation` — the same split
 * `tests/unit/server-core-portability.test.ts` performs against the
 * unbundled source, so the two runtimes exercise the identical sequence of
 * calls against the identical input.
 */
function runTenMinuteReproduction(): unknown {
  const { inputDocument, tenMinutesMs } = ten_minute_fixture;

  const migrated = migrateSaveDocument(inputDocument, BASE_GAME_BALANCE);
  const validated = validateSaveDocument(migrated, BASE_GAME_BALANCE);
  const loaded = deserializeSaveDocument(validated, BASE_GAME_BALANCE);

  const advancedByOneTick = advanceSimulation(loaded.state, SIMULATION_STEP_MS);
  const finalState = catchUpSimulation(
    advancedByOneTick,
    tenMinutesMs - SIMULATION_STEP_MS,
  );

  return createSaveDocument(
    finalState,
    BASE_GAME_BALANCE,
    inputDocument.savedAtTimestampMs + tenMinutesMs,
  );
}

// Guarded the same way `save-sync/index.ts` is (server-milestone Step 7): a
// unit test importing `runTenMinuteReproduction` in isolation must not also
// start a live listener.
if (import.meta.main) {
  Deno.serve((request: Request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(400, 'malformed_request', 'GET only.');
    }

    try {
      const outputDocument = runTenMinuteReproduction();
      return jsonResponse(200, { outputDocument });
    } catch (error) {
      console.error('core-portability-check: reproduction failed.', error);
      return errorResponse(
        500,
        'server_error',
        error instanceof Error ? error.message : 'Unknown error.',
      );
    }
  });
}
