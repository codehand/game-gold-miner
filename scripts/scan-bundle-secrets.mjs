/**
 * Scans a build output directory for values that must never be shipped to a
 * browser.
 *
 * This is the second half of server-milestone Step 4's validation: "A grep of
 * `dist/` after a production build finds no service-role key and no non-public
 * secret." It runs in `npm run verify` between `build` and `test:prod`, so a
 * leak fails the ordinary gate rather than waiting to be noticed.
 *
 * Three independent checks, because each catches a different mistake:
 *
 * 1. Structural. Any JWT in the output whose payload declares
 *    `"role": "service_role"`, and any `sb_secret_*` key, regardless of where
 *    it came from. This catches a key pasted into source by hand.
 * 2. Exact value. Every non-`VITE_` value across all three local env files —
 *    `.env.local` (Vite/Node), `.env` (the file `env(...)` substitution in
 *    `supabase/config.toml` reads, e.g. Step 10's `GOOGLE_CLIENT_SECRET`),
 *    and `supabase/functions/.env` (what Edge Functions read at runtime
 *    locally, e.g. Step 12's `TELEGRAM_BOT_TOKEN`) — plus the live
 *    service-role key of a running local stack. This catches a variable
 *    that was given a `VITE_` prefix, or read through `import.meta.env` and
 *    inlined.
 * 3. Variable name. Every non-`VITE_` name in `.env.example`. Vite only inlines
 *    `VITE_`-prefixed names, so a server-only name appearing in the bundle
 *    means client code is reaching for a credential it must not have.
 *
 * The anon/publishable key is deliberately not flagged: it is public by design
 * and Step 8 ships it in the bundle on purpose.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Buffer } from 'node:buffer';

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const SUPABASE_SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{8,}/g;
const SCANNED_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);

/**
 * A `.env.local` value this scanner cannot usefully grep for: an unedited
 * placeholder copied from `.env.example`, or a value short enough that
 * searching the bundle for it would match unrelated text. Skipping one is a
 * real loss of coverage, so every skip is reported rather than dropped.
 */
function isUncheckableValue(value) {
  return value.startsWith('your-') || value.startsWith('generate-') || value.length < 12;
}

/**
 * Reads one `.env` value with dotenv's own quoting rules: a quoted value ends
 * at its closing quote, an unquoted one ends at the first whitespace-preceded
 * `#`. Both matter here. A trailing ` # local only` left attached to the value
 * would make `contents.includes(value)` unable to match the real secret, so the
 * exact-value check would report as having run while checking a string that
 * cannot occur in any bundle.
 */
function parseEnvValue(raw) {
  const quote = raw[0];
  if (quote === '"' || quote === "'") {
    const closingIndex = raw.indexOf(quote, 1);
    return closingIndex === -1 ? raw.slice(1) : raw.slice(1, closingIndex);
  }
  const commentIndex = raw.search(/\s#/);
  return (commentIndex === -1 ? raw : raw.slice(0, commentIndex)).trim();
}

function parseEnvFile(path) {
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return null;
  }

  const entries = new Map();
  for (const rawLine of contents.split('\n')) {
    let line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    // `export NAME=value` is valid in a file meant to be sourced by a shell.
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const name = line.slice(0, separatorIndex).trim();
    entries.set(name, parseEnvValue(line.slice(separatorIndex + 1).trim()));
  }
  return entries;
}

/**
 * The running local stack's privileged keys, or an empty array when it is not
 * up. Supabase issues two: the legacy `SERVICE_ROLE_KEY` JWT and the newer
 * `SECRET_KEY`. Both bypass row-level security, so both are forbidden output.
 */
function readLocalPrivilegedKeys(projectRoot) {
  let output;
  try {
    output = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // The stack is not running. Expected in CI and on a fresh checkout; the
    // `.env.local` values and the structural checks still apply.
    return { keys: [], stackRunning: false, unreadable: false };
  }

  // The CLI may print notices before the payload; the JSON starts at `{`.
  const start = output.indexOf('{');
  let status;
  try {
    if (start === -1) {
      throw new Error('no JSON payload');
    }
    status = JSON.parse(output.slice(start));
  } catch {
    // The stack answered but we could not read it. Reported rather than
    // swallowed: silently returning no keys turns the exact-value check into a
    // no-op that still prints as if it ran.
    return { keys: [], stackRunning: true, unreadable: true };
  }

  return {
    keys: [status.SERVICE_ROLE_KEY, status.SECRET_KEY].filter(
      (key) => typeof key === 'string' && key !== '',
    ),
    stackRunning: true,
    unreadable: false,
  };
}

function collectFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const extensionIndex = entry.lastIndexOf('.');
      const extension = extensionIndex === -1 ? '' : entry.slice(extensionIndex);
      if (SCANNED_EXTENSIONS.has(extension)) {
        files.push(path);
      }
    }
  };
  walk(directory);
  return files;
}

function declaresServiceRole(token) {
  const payload = token.split('.')[1];
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * @param {string} buildDirectory directory to scan, typically `dist/`.
 * @param {string} projectRoot repository root holding `.env.example`.
 * @returns {{ findings: Array<{file: string, reason: string}>, scannedFileCount: number, checks: string[], warnings: string[] }}
 */
export function scanBuildOutputForSecrets(buildDirectory, projectRoot) {
  const directory = resolve(buildDirectory);
  const root = resolve(projectRoot);

  const exampleEntries = parseEnvFile(join(root, '.env.example')) ?? new Map();
  const localEntries = parseEnvFile(join(root, '.env.local'));
  // Server-milestone Step 10: `GOOGLE_CLIENT_SECRET` lives here, not in
  // `.env.local` — the Supabase CLI's `env(...)` substitution only reads a
  // file literally named `.env` (see `.env.example`). A real credential in
  // this file is exactly as forbidden from the bundle as one in `.env.local`,
  // so it needs the same exact-value check, not a separate weaker one.
  const envEntries = parseEnvFile(join(root, '.env'));
  // Server-milestone Step 12: `TELEGRAM_BOT_TOKEN` lives in a *third* file,
  // `supabase/functions/.env` — the one Edge Functions actually read at
  // runtime locally (see `.env.example`) — and is the most sensitive of the
  // three env files this scanner covers: it is the HMAC key that signs
  // Telegram `initData`, so a leak lets an attacker forge a session for any
  // Telegram user id. A 2026-09-12 review found this file was still missing
  // from the exact-value check even after `.env` was added for Step 10 —
  // the structural (JWT/`sb_secret_`) and name checks below still covered
  // it, but a hardcoded literal token would have passed both.
  const functionsEnvEntries = parseEnvFile(join(root, 'supabase', 'functions', '.env'));

  const forbiddenNames = [...exampleEntries.keys()].filter((name) => !name.startsWith('VITE_'));

  // A value the client already publishes under its own name cannot also be a
  // secret. The Edge Function reads `SUPABASE_ANON_KEY` and `SUPABASE_URL`
  // without a prefix, so an environment carrying both spellings would otherwise
  // fail the build on the exact anon key Step 8 ships on purpose.
  //
  // The exemption matches the *twin name* — `X` against `VITE_X` with the same
  // value — deliberately, rather than matching any published value. Exempting
  // by value alone would let a real secret exempt itself simply by being
  // mirrored under some unrelated VITE_ name, which is the leak, not a licence.
  // `VITE_` names only ever live in `.env.local` (`.env` is Supabase-CLI-only
  // configuration and Vite never reads it), so the twin lookup stays anchored
  // to `localEntries` regardless of which file the candidate secret came from.
  const isPublishedTwin = (name, value) =>
    localEntries?.get(`VITE_${name}`) === value;

  const forbiddenValues = new Set();
  const uncheckableNames = [];
  for (const entries of [localEntries, envEntries, functionsEnvEntries]) {
    if (!entries) {
      continue;
    }
    for (const [name, value] of entries) {
      if (name.startsWith('VITE_') || value === '' || isPublishedTwin(name, value)) {
        continue;
      }
      if (isUncheckableValue(value)) {
        uncheckableNames.push(name);
        continue;
      }
      forbiddenValues.add(value);
    }
  }

  const localStack = readLocalPrivilegedKeys(root);
  for (const key of localStack.keys) {
    // A privileged key is forbidden even if someone has mirrored it under a
    // VITE_ name: that mirroring is the leak, not an exemption.
    forbiddenValues.add(key);
  }

  const findings = [];
  const files = collectFiles(directory);

  for (const file of files) {
    const contents = readFileSync(file, 'utf8');
    const name = relative(root, file);

    for (const token of contents.match(JWT_PATTERN) ?? []) {
      if (declaresServiceRole(token)) {
        findings.push({ file: name, reason: 'contains a JWT whose payload declares role=service_role' });
      }
    }

    for (const key of contents.match(SUPABASE_SECRET_KEY_PATTERN) ?? []) {
      findings.push({ file: name, reason: `contains a Supabase secret key (${key.slice(0, 14)}…)` });
    }

    for (const value of forbiddenValues) {
      if (contents.includes(value)) {
        findings.push({ file: name, reason: 'contains a server-only value from the environment' });
      }
    }

    for (const variableName of forbiddenNames) {
      if (contents.includes(variableName)) {
        findings.push({ file: name, reason: `references the server-only variable ${variableName}` });
      }
    }
  }

  const checks = [
    'service-role JWT payloads',
    'sb_secret_* keys',
    `${forbiddenValues.size} exact server-only value(s)`,
    `${forbiddenNames.length} server-only variable name(s)`,
  ];

  const warnings = [];
  if (localStack.unreadable) {
    warnings.push(
      'the local stack is running but its status could not be parsed, so its live keys were NOT checked',
    );
  }
  if (!localEntries) {
    // `.env` is normal to be missing entirely — most steps need nothing in
    // it, so no equivalent warning fires for it — but `.env.local` is the
    // primary channel every `import.meta.env` read comes from, so its
    // absence is worth flagging even though a present `.env` may still have
    // contributed values above.
    warnings.push('no .env.local, so no exact value from it was checked');
  }
  if (uncheckableNames.length > 0) {
    warnings.push(
      `${uncheckableNames.length} environment value(s) are still placeholders or too short to grep for, ` +
        `so they were NOT checked: ${uncheckableNames.join(', ')}`,
    );
  }
  if (files.length === 0) {
    warnings.push('the build output held no scannable file, so nothing was checked');
  }

  return { findings, scannedFileCount: files.length, checks, warnings };
}

const isDirectInvocation = process.argv[1] && process.argv[1].endsWith('scan-bundle-secrets.mjs');

if (isDirectInvocation) {
  const projectRoot = process.cwd();
  const buildDirectory = process.argv[2] ?? join(projectRoot, 'dist');

  try {
    statSync(buildDirectory);
  } catch {
    console.error(`Build output not found at ${buildDirectory}. Run \`npm run build\` first.`);
    process.exit(1);
  }

  const { findings, scannedFileCount, checks, warnings } = scanBuildOutputForSecrets(
    buildDirectory,
    projectRoot,
  );

  if (findings.length > 0) {
    console.error(`Secret scan FAILED: ${findings.length} finding(s) in ${buildDirectory}.`);
    for (const finding of findings) {
      console.error(`  ${finding.file}: ${finding.reason}`);
    }
    process.exit(1);
  }

  if (scannedFileCount === 0) {
    // Nothing was read, so nothing can be vouched for. Printing a pass here
    // would report the strongest possible result from the weakest possible
    // evidence.
    console.error(
      `Secret scan could not run: no scannable file in ${buildDirectory}. Run \`npm run build\` first.`,
    );
    process.exit(1);
  }

  console.log(`Secret scan passed: ${scannedFileCount} file(s) in ${buildDirectory}.`);
  for (const check of checks) {
    console.log(`  checked ${check}`);
  }
  for (const warning of warnings) {
    console.warn(`  WARNING: ${warning}`);
  }
}
