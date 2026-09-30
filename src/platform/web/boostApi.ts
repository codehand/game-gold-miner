import { validateBoostState, type BoostState } from '../../core';

export interface BoostServerResponse {
  readonly kind: 'status' | 'activated' | 'cooldown';
  readonly boost: BoostState;
  readonly serverNowMs: number;
}

/** The activation endpoint owns cooldown and time; the browser never posts a timestamp. */
export async function requestBoostViaFetch(
  functionUrl: string,
  accessToken: string,
  action: 'status' | 'activate',
): Promise<BoostServerResponse> {
  const response = await fetch(`${functionUrl}/v1/${action}`, {
    method: action === 'activate' ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Boost ${action} failed: HTTP ${response.status}`);
  const body = await response.json() as Partial<BoostServerResponse>;
  if (
    !['status', 'activated', 'cooldown'].includes(body.kind ?? '') ||
    !Number.isSafeInteger(body.serverNowMs) ||
    typeof body.boost !== 'object' || body.boost === null
  ) {
    throw new Error('Boost service returned an invalid response.');
  }
  const boost = validateBoostState(body.boost);
  return { kind: body.kind!, boost, serverNowMs: body.serverNowMs! };
}
