import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const SCRIPT = join(PROJECT_ROOT, 'scripts', 'monitoring-check.mjs');

function runFixture(name: string) {
  return spawnSync(
    process.execPath,
    [SCRIPT, '--input', join('tests', 'fixtures', name)],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
}

describe('Step 35 monitoring evaluator', () => {
  it('stays green for a healthy window', () => {
    const result = runFixture('monitoring-healthy.json');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe('ok');
  });

  it('raises the alert exit code for a deliberately induced failure', () => {
    const result = runFixture('monitoring-failure.json');
    expect(result.status).toBe(2);
    const body = JSON.parse(result.stdout);
    expect(body.status).toBe('alert');
    expect(body.alerts.map((alert: { code: string }) => alert.code)).toEqual([
      'health_down',
      'error_rate_high',
      'save_rejection_rate_high',
      'auth_failure_rate_high',
    ]);
  });
});
