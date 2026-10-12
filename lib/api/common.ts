import { COMMON_API_BASE_URL } from './config';
import { ApiError, NetworkError } from './errors';
import { renewAccessToken } from './session-bridge';

/**
 * Calls costonomy-common-api: sign-in and sessions, and the business, outlet and team records the marketplace shares
 * with Costonomy's other apps. The same access token works here and on the marketplace API.
 *
 * <p>Common answers with the resource itself (no `{ data, error }` envelope) and errors as
 * `{ error: { code, message, details } }`; both become the same {@link ApiError} the rest of the app handles.
 */
export interface CommonRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  /** Sent as `Idempotency-Key`, so a retried create returns what the first one made. */
  idempotencyKey?: string;
}

export async function commonRequest<T>(path: string, options: CommonRequestOptions = {}): Promise<T> {
  try {
    return await perform<T>(path, options, options.token);
  } catch (error) {
    // An expired access token: renew once and repeat (the server rejected the first call at authentication).
    if (error instanceof ApiError && error.isUnauthenticated && options.token) {
      const fresh = await renewAccessToken();
      if (fresh) return perform<T>(path, options, fresh);
    }
    throw error;
  }
}

async function perform<T>(path: string, options: CommonRequestOptions, token?: string | null): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${COMMON_API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new NetworkError();
  }
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After');
    throw new ApiError({
      code: body?.error?.code ?? 'UNEXPECTED_ERROR',
      message: body?.error?.message ?? 'Something went wrong. Please try again.',
      status: response.status,
      requestId: body?.error?.requestId,
      details: body?.error?.details,
      retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined,
    });
  }
  return body as T;
}
