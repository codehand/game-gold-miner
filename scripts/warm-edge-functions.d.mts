/**
 * Type surface for `warm-edge-functions.mjs`, so `tests/unit/` can import the
 * warm-up loop under `tsc --noEmit` without the script itself becoming
 * TypeScript — the same split, and the same reason, as
 * `scripts/scan-bundle-secrets.d.mts`. `scripts/verify-server-stack.mjs` runs
 * this module directly from `package.json` with no build step.
 *
 * `tests/server-integration/recovery-code.integration.test.ts` imports it too,
 * so the retry loop that survives a cold worker is the identical one a unit
 * test drives with an injected `fetch`.
 */

export const WARMUP_MAX_ATTEMPTS: number;
export const WARMUP_ATTEMPT_TIMEOUT_MS: number;
export const WARMUP_RETRY_DELAY_MS: number;
/** The retry loop's worst case, for sizing a caller's own hook timeout above it. */
export const WARMUP_WORST_CASE_MS: number;
export const WARMUP_PROBE_METHOD: string;
export const WARMUP_PROBE_PATH_SUFFIX: string;

export interface EdgeFunctionWarmupOptions {
  /** Base the functions are deployed under, e.g. `http://127.0.0.1:54321/functions/v1`. */
  readonly functionsBaseUrl: string;
  /** Injected so a unit test needs no Docker and no live stack. */
  readonly fetchImpl?: typeof fetch;
  readonly maxAttempts?: number;
  readonly attemptTimeoutMs?: number;
  readonly retryDelayMs?: number;
}

export interface EdgeFunctionWarmupResult {
  readonly name: string;
  /** True once *any* HTTP response came back — a refusal included. */
  readonly responded: boolean;
  readonly attempts: number;
  /** The refusal's status, or `0` when nothing was ever answered. */
  readonly status: number;
}

export interface EdgeFunctionWarmupPassOptions extends EdgeFunctionWarmupOptions {
  /** Directory whose subdirectories name the functions, `_shared` excluded. */
  readonly functionsDirectory: string;
}

export function readEdgeFunctionNames(functionsDirectory: string): string[];

export function warmEdgeFunction(
  name: string,
  options: EdgeFunctionWarmupOptions,
): Promise<EdgeFunctionWarmupResult>;

export function warmEdgeFunctions(
  options: EdgeFunctionWarmupPassOptions,
): Promise<EdgeFunctionWarmupResult[]>;
