/**
 * An error the API returned, in its own vocabulary.
 *
 * <p>The backend's error contract is fixed and tested (`ErrorContractTest`), so
 * the app can switch on `code` rather than parse messages. The three that matter
 * most to a caller:
 *
 * - **409** a state or concurrency conflict — worth retrying *after* refreshing
 *   the resource, because the server's answer has moved on.
 * - **422** a business refusal — retrying changes nothing; the user has to.
 * - **429** throttled — wait `retryAfterSeconds`, which the server always sends.
 *
 * `message` is written for a restaurant owner, not a developer, so it is safe to
 * show directly. Falling back to our own copy would replace a specific sentence
 * with a vague one.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.details = params.details;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }

  /** The session is gone. The only error the app responds to by signing out. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Refresh and try again, rather than showing the user a failure. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** The server said no for a business reason. Retrying is pointless. */
  get isBusinessRefusal(): boolean {
    return this.status === 422;
  }

  get isThrottled(): boolean {
    return this.status === 429;
  }

  /**
   * Whether retrying the same request could plausibly succeed.
   *
   * <p>Deliberately excludes 422: a refusal the user has to act on is not a
   * transient failure, and retrying it silently would hide the reason.
   */
  get isRetryable(): boolean {
    return this.isThrottled || this.status >= 500;
  }
}

/**
 * The network did not reach the server.
 *
 * <p>Distinct from an `ApiError` on purpose: "we could not reach Mandi" and
 * "Mandi says no" need different words in front of a user, and only the first is
 * worth an automatic retry.
 */
export class NetworkError extends Error {
  constructor(message = 'Could not reach Mandi. Check your connection.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
