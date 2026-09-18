import { defineConfig } from 'vitest/config';

/**
 * Server-milestone Step 7: integration tests against the local stack with a
 * real database, kept out of `vitest.config.ts`'s `tests/unit/**` glob so
 * `npm test`/`npm run verify` (no Docker required) never picks them up by
 * accident. `npm run test:server-integration` assumes the stack is already
 * up and reset — `scripts/verify-server-stack.mjs` runs it in that order.
 *
 * `testTimeout: 30_000` — a 2026-09-12 review finding: with no timeout set
 * here, Vitest's own 5 s default applied to every test in this suite, while
 * the tests themselves budget each `fetch()` at `AbortSignal.timeout(20_000)`.
 * That 20 s budget was unreachable — Vitest killed the test at 5 s first,
 * 4× tighter than the code's own declared intent. Reproduced as a real,
 * load-dependent flake (not a cold-boot one: a fresh stack ran clean
 * repeatedly) once the local stack had accumulated state across many prior
 * suite runs. 30 s leaves headroom above the 20 s per-request budget for
 * setup/teardown around it, rather than merely matching it exactly.
 *
 * `hookTimeout: 30_000` — the same bug, one field over, found on 2026-09-16
 * while fixing the CI cold-start failures. Setting only `testTimeout` leaves
 * `hookTimeout` at Vitest's own 10 s default, so a `beforeAll` whose own
 * `fetch` declares a 20 s budget can be killed at 10 s — before the request it
 * is waiting on has had the room the hook code itself asked for. It is what
 * made `recovery-code.integration.test.ts`'s one-shot rate-limit reset the
 * most fragile call in the suite: a cold worker's first response on a loaded
 * runner, under a budget tighter than either the hook or its request declared.
 * 30 s keeps the same headroom above the 20 s per-request budget the suite
 * uses everywhere else. The two warm-up hooks that declare their own, larger,
 * `WARMUP_HOOK_TIMEOUT_MS` are unaffected — a per-hook timeout overrides this.
 *
 * `fileParallelism: false` — added by Step 26, and it is a correctness
 * requirement rather than a speed trade.
 *
 * The local stack is observed as **one address**, so the Edge Functions' own
 * rate limiters are shared by every file in this suite: a flood in one file
 * spends the bucket another file is measuring, and the only way to empty it
 * again is the test-only reset route, which a *different* file calling
 * concurrently makes the first file's measurement meaningless in the other
 * direction. Measured on 2026-09-18 with `recovery-code.integration.test.ts`
 * (whose throttle test fills the shared bucket and then proves the reset route
 * clears it) and the new `adversarial.integration.test.ts` (whose attack 8 and
 * attack 9 must redeem the real store, so they reset the bucket first): run in
 * parallel, the throttle test never saw its `429` — the other file's reset
 * cleared the bucket underneath it — and the sibling's concurrent-redemption
 * tests were answered `429` by the bucket the throttle test had just filled.
 * Both are failures the code under test is not responsible for.
 *
 * Serialising the files makes each one the only consumer of the shared bucket
 * for its duration, which is exactly the assumption `recovery-code`'s
 * `beforeAll`/`afterAll` reset discipline already makes. It costs roughly a
 * minute on the full suite and removes the class rather than widening a retry
 * budget, which is TASK-002's rule: pay a startup cost once, in one place,
 * instead of making every caller absorb it. Tests *within* a file are already
 * sequential, so file order is the only remaining variable — and every file's
 * reset hook leaves the bucket empty whether it ran first or last.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server-integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
