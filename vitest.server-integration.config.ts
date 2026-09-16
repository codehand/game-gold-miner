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
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server-integration/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
