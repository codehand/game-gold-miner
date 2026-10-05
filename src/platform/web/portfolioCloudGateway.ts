import {
  validatePortfolioSaveDocument,
  type PortfolioSaveDocumentV4,
} from '../../persistence/portfolioSaveSchema';
import type { MineSiteId } from '../../config/mineSites';

export interface PortfolioCloudAuth {
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
  refreshSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
}

export type PortfolioCloudCommand =
  | { readonly type: 'migrate' | 'suspend'; readonly baseRevision: number; readonly idempotencyKey: string }
  | { readonly type: 'purchase'; readonly mineId: MineSiteId; readonly baseRevision: number; readonly idempotencyKey: string }
  | { readonly type: 'enter'; readonly mineId: MineSiteId; readonly effectiveAtMs?: number; readonly baseRevision: number; readonly idempotencyKey: string };

export type PortfolioCloudResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'missing' }
  | { readonly kind: 'conflict'; readonly revision: number | null; readonly document: unknown }
  | { readonly kind: 'rejected'; readonly code: string; readonly reason: string | null }
  | { readonly kind: 'unavailable'; readonly reason?: string };

export interface PortfolioCloudSnapshot {
  readonly revision: number;
  readonly receivedAt: string;
  readonly document: unknown;
  readonly offlineGrants?: Readonly<Record<string, {
    readonly elapsedDurationMs: number;
    readonly creditedDurationMs: number;
    readonly reward: string;
  }>>;
}

export interface PortfolioCloudAccepted {
  readonly revision: number;
  readonly receivedAt: string;
  readonly document: PortfolioSaveDocumentV4;
  readonly result?: Record<string, unknown>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** One authenticated transport for V4 routine saves and server-owned commands. */
export class PortfolioCloudGateway {
  readonly #baseUrl: string;
  readonly #auth: PortfolioCloudAuth;
  readonly #fetch: FetchLike;
  #lastRequestFailure = 'request-failed';

  public constructor(baseUrl: string, auth: PortfolioCloudAuth, fetchFn: FetchLike = fetch) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#auth = auth;
    // Native window.fetch rejects when invoked with this gateway as its
    // receiver. The wrapper preserves a plain function call in browsers.
    this.#fetch = (input, init) => fetchFn(input, init);
  }

  public async download(): Promise<PortfolioCloudResult<PortfolioCloudSnapshot>> {
    const response = await this.#request('/v1/save', 'GET');
    if (response === null) return { kind: 'unavailable', reason: this.#lastRequestFailure };
    if (response.status === 204) return { kind: 'missing' };
    if (response.status !== 200) return await failure(response);
    try {
      const body = await response.json() as PortfolioCloudSnapshot;
      if (!Number.isSafeInteger(body.revision) || body.revision < 1 ||
          typeof body.receivedAt !== 'string' || !Number.isFinite(Date.parse(body.receivedAt)) ||
          typeof body.document !== 'object' || body.document === null) {
        return { kind: 'unavailable', reason: 'invalid-download-response' };
      }
      return { kind: 'ok', value: body };
    } catch {
      return { kind: 'unavailable', reason: 'invalid-download-response' };
    }
  }

  public async upload(
    baseRevision: number | null,
    document: PortfolioSaveDocumentV4,
  ): Promise<PortfolioCloudResult<PortfolioCloudAccepted>> {
    return await this.#write('/v1/save', 'PUT', { baseRevision, document });
  }

  public async command(
    command: PortfolioCloudCommand,
  ): Promise<PortfolioCloudResult<PortfolioCloudAccepted>> {
    return await this.#write('/v1/portfolio/command', 'POST', command);
  }

  async #write(
    path: string,
    method: 'PUT' | 'POST',
    body: unknown,
  ): Promise<PortfolioCloudResult<PortfolioCloudAccepted>> {
    const response = await this.#request(path, method, body);
    if (response === null) return { kind: 'unavailable', reason: this.#lastRequestFailure };
    if (response.status !== 200) return await failure(response);
    try {
      const value = await response.json() as PortfolioCloudAccepted;
      if (!Number.isSafeInteger(value.revision) || value.revision < 1 ||
          typeof value.receivedAt !== 'string' ||
          !Number.isFinite(Date.parse(value.receivedAt))) {
        return { kind: 'unavailable', reason: 'invalid-write-response' };
      }
      return {
        kind: 'ok',
        value: { ...value, document: validatePortfolioSaveDocument(value.document) },
      };
    } catch {
      return { kind: 'unavailable', reason: 'invalid-write-response' };
    }
  }

  async #request(path: string, method: 'GET' | 'PUT' | 'POST', body?: unknown): Promise<Response | null> {
    try {
      const firstSession = await this.#auth.getSession();
      if (firstSession.error) {
        this.#lastRequestFailure = 'session-read-failed';
        return null;
      }
      if (firstSession.data.session === null) {
        this.#lastRequestFailure = 'session-missing';
        return null;
      }
      let response = await this.#send(path, method, firstSession.data.session.access_token, body);
      if (response.status !== 401) return response;
      const refreshed = await this.#auth.refreshSession();
      if (refreshed.error || refreshed.data.session === null) {
        this.#lastRequestFailure = 'session-refresh-failed';
        return null;
      }
      response = await this.#send(path, method, refreshed.data.session.access_token, body);
      return response;
    } catch (error) {
      this.#lastRequestFailure = error instanceof Error
        ? `request-failed:${error.message}` : 'request-failed';
      return null;
    }
  }

  #send(path: string, method: 'GET' | 'PUT' | 'POST', token: string, body?: unknown) {
    return this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  }
}

async function failure(response: Response): Promise<PortfolioCloudResult<never>> {
  let body: {
    error?: { code?: unknown; detail?: {
      reason?: unknown;
      counter?: unknown;
      serverRevision?: unknown;
      document?: unknown;
    } };
  } = {};
  try {
    body = await response.json();
  } catch {
    // A gateway/transport error need not carry the game's JSON envelope.
  }
  if (response.status === 409) {
    const revision = body.error?.detail?.serverRevision;
    return {
      kind: 'conflict',
      revision: typeof revision === 'number' ? revision : null,
      document: body.error?.detail?.document ?? null,
    };
  }
  if (response.status >= 500 || response.status === 429) {
    return { kind: 'unavailable', reason: `http_${response.status}` };
  }
  return {
    kind: 'rejected',
    code: typeof body.error?.code === 'string' ? body.error.code : `http_${response.status}`,
    reason: typeof body.error?.detail?.reason === 'string'
      ? body.error.detail.reason
      : typeof body.error?.detail?.counter === 'string'
        ? body.error.detail.counter : null,
  };
}
