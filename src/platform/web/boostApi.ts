import { MINE_SITE_IDS, type MineSiteId } from '../../config';
import { validateBoostState, type BoostState } from '../../core';

export interface BoostServerResponse {
  readonly kind: 'status' | 'activated' | 'cooldown';
  readonly boost: BoostState;
  readonly boostMineId: MineSiteId | null;
  readonly saveRevision?: number;
  readonly serverNowMs: number;
}

export interface BoostActivationCommand {
  readonly mineId: MineSiteId;
  readonly baseRevision: number;
  readonly idempotencyKey: string;
}

/** The activation endpoint owns cooldown and time; the browser never posts a timestamp. */
export async function requestBoostViaFetch(
  functionUrl: string,
  accessToken: string,
  action: 'status' | 'activate',
  command?: BoostActivationCommand,
): Promise<BoostServerResponse> {
  if (action === 'activate' && command === undefined) {
    throw new Error('Boost activation requires the active mine and save revision.');
  }
  const response = await fetch(`${functionUrl}/v1/${action}`, {
    method: action === 'activate' ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(action === 'activate' ? { 'content-type': 'application/json' } : {}),
    },
    body: action === 'activate' ? JSON.stringify(command) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Boost ${action} failed: HTTP ${response.status}`);
  const body = await response.json() as Partial<BoostServerResponse>;
  if (
    !['status', 'activated', 'cooldown'].includes(body.kind ?? '') ||
    !Number.isSafeInteger(body.serverNowMs) ||
    (body.boostMineId !== null && !MINE_SITE_IDS.includes(body.boostMineId as MineSiteId)) ||
    (body.kind === 'activated' && !Number.isSafeInteger(body.saveRevision)) ||
    typeof body.boost !== 'object' || body.boost === null
  ) {
    throw new Error('Boost service returned an invalid response.');
  }
  const boost = validateBoostState(body.boost);
  return {
    kind: body.kind!, boost,
    boostMineId: body.boostMineId as MineSiteId | null,
    ...(body.saveRevision === undefined ? {} : { saveRevision: body.saveRevision }),
    serverNowMs: body.serverNowMs!,
  };
}
