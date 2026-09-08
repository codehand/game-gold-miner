/**
 * Type surface for `scan-bundle-secrets.mjs`, so `tests/unit/` can import the
 * scanner under `tsc --noEmit` without the script itself becoming TypeScript.
 * The script must stay plain JavaScript: it runs directly from `package.json`
 * with no build step.
 */

export interface SecretScanFinding {
  readonly file: string;
  readonly reason: string;
}

export interface SecretScanResult {
  readonly findings: readonly SecretScanFinding[];
  readonly scannedFileCount: number;
  /** Human-readable list of what was checked, for the CLI summary. */
  readonly checks: readonly string[];
  /** Conditions that reduced coverage; never silent. */
  readonly warnings: readonly string[];
}

export function scanBuildOutputForSecrets(
  buildDirectory: string,
  projectRoot: string,
): SecretScanResult;
