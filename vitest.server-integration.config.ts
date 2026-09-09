import { defineConfig } from 'vitest/config';

/**
 * Server-milestone Step 7: integration tests against the local stack with a
 * real database, kept out of `vitest.config.ts`'s `tests/unit/**` glob so
 * `npm test`/`npm run verify` (no Docker required) never picks them up by
 * accident. `npm run test:server-integration` assumes the stack is already
 * up and reset — `scripts/verify-server-stack.mjs` runs it in that order.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server-integration/**/*.test.ts'],
  },
});
