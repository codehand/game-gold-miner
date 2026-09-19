/**
 * Server-milestone Step 35: evaluate one normalized monitoring window.
 *
 * A production log export (Supabase logs, a webhook sink, or a scheduled SQL
 * query over save_audit) supplies the JSON snapshot. Keeping the threshold
 * evaluator here makes the alert behavior deterministic and testable even
 * before production credentials and a log sink exist.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_HEALTH_URL = 'http://127.0.0.1:54321/functions/v1/save-sync/v1/health';
const MIN_SAMPLE_SIZE = 20;
export const MONITORING_THRESHOLDS = Object.freeze({
  errorRate: 0.05,
  saveRejectionRate: 0.10,
  authFailureRate: 0.25,
});

function readInputPath() {
  const index = process.argv.indexOf('--input');
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function readHealthUrl() {
  const index = process.argv.indexOf('--health-url');
  return index === -1
    ? process.env.MONITORING_HEALTH_URL ?? DEFAULT_HEALTH_URL
    : process.argv[index + 1] ?? DEFAULT_HEALTH_URL;
}

function readSnapshot() {
  const inputPath = readInputPath();
  if (inputPath !== null) {
    return JSON.parse(readFileSync(join(PROJECT_ROOT, inputPath), 'utf8'));
  }
  if (typeof process.env.MONITORING_SNAPSHOT === 'string') {
    return JSON.parse(process.env.MONITORING_SNAPSHOT);
  }
  return { healthUrl: readHealthUrl() };
}

async function resolveHealth(snapshot) {
  if (snapshot.health !== undefined) {
    return snapshot.health;
  }
  const response = await fetch(snapshot.healthUrl ?? readHealthUrl(), {
    signal: AbortSignal.timeout(10_000),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // The status and transport failure below are enough to raise the alert.
  }
  return { status: response.ok && body?.status === 'ok' ? 'ok' : 'down', httpStatus: response.status };
}

function count(group, key) {
  const value = group?.[key];
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function thresholdAlert(code, value, threshold, sampleSize, message) {
  return {
    code,
    value,
    threshold,
    sampleSize,
    message,
  };
}

export function evaluateMonitoringSnapshot(snapshot, health) {
  const requestTotal = count(snapshot.requests, 'total');
  const serverErrors = count(snapshot.requests, 'serverErrors');
  const saveAttempts = count(snapshot.saves, 'attempts');
  const saveRejections = count(snapshot.saves, 'rejections');
  const authAttempts = count(snapshot.auth, 'attempts');
  const authFailures = count(snapshot.auth, 'failures');
  const errorRate = rate(serverErrors, requestTotal);
  const saveRejectionRate = rate(saveRejections, saveAttempts);
  const authFailureRate = rate(authFailures, authAttempts);
  const alerts = [];

  if (health?.status !== 'ok') {
    alerts.push({ code: 'health_down', message: 'Save-sync health check is not healthy.' });
  }
  if (requestTotal >= MIN_SAMPLE_SIZE && errorRate > MONITORING_THRESHOLDS.errorRate) {
    alerts.push(
      thresholdAlert(
        'error_rate_high',
        errorRate,
        MONITORING_THRESHOLDS.errorRate,
        requestTotal,
        'Server error rate exceeded the five-percent threshold.',
      ),
    );
  }
  if (saveAttempts >= MIN_SAMPLE_SIZE && saveRejectionRate > MONITORING_THRESHOLDS.saveRejectionRate) {
    alerts.push(
      thresholdAlert(
        'save_rejection_rate_high',
        saveRejectionRate,
        MONITORING_THRESHOLDS.saveRejectionRate,
        saveAttempts,
        'Save rejection rate exceeded the ten-percent threshold.',
      ),
    );
  }
  if (authAttempts >= MIN_SAMPLE_SIZE && authFailureRate > MONITORING_THRESHOLDS.authFailureRate) {
    alerts.push(
      thresholdAlert(
        'auth_failure_rate_high',
        authFailureRate,
        MONITORING_THRESHOLDS.authFailureRate,
        authAttempts,
        'Auth failure rate exceeded the twenty-five-percent threshold.',
      ),
    );
  }

  return {
    status: alerts.length === 0 ? 'ok' : 'alert',
    thresholds: MONITORING_THRESHOLDS,
    rates: { errorRate, saveRejectionRate, authFailureRate },
    alerts,
  };
}

async function main() {
  const snapshot = readSnapshot();
  const health = await resolveHealth(snapshot);
  const result = evaluateMonitoringSnapshot(snapshot, health);
  console.log(JSON.stringify({ ...result, health }, null, 2));
  if (result.status === 'alert') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`FAIL  monitoring check — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
