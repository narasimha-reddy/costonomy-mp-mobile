/**
 * Server clock offset.
 *
 * PRD §13 and §23A.34: the supplier acceptance countdown is driven by the
 * server's `responseDeadlineAt`, **not the device clock**. A phone whose clock
 * is two minutes fast would otherwise show an order as expired while the backend
 * still accepts it — or, worse, show 40 seconds remaining on an order the
 * backend has already timed out, and the supplier taps Accept into a guaranteed
 * `SUPPLIER_ORDER_EXPIRED`.
 *
 * We cannot change the device clock, so instead we measure how wrong it is. Every
 * API response carries a `Date` header; the API client feeds it to `syncFromResponse()`
 * and we keep the difference. `serverNow()` then returns the device clock
 * corrected by that offset.
 *
 * The offset is deliberately *not* persisted. A stale offset from a previous
 * session is worse than none: the drift it was correcting for may be gone, and
 * the user may have crossed a timezone or fixed their clock. We start at zero
 * each launch and converge on the first response, which is always before any
 * countdown can be on screen.
 *
 * This is presentation only. Whether an order can still be accepted is decided
 * by the backend, atomically, when the acceptance request arrives (doc 03 §5,
 * "Acceptance and timeout must race safely"). A countdown that reaches zero a
 * moment early or late changes what the supplier sees, never what is true.
 */

let offsetMs = 0;
let synced = false;

/**
 * Record the server's time from a response.
 *
 * `requestStartedAt` should be `Date.now()` taken immediately before the fetch.
 * Half the round trip is subtracted so a slow network does not read as clock
 * drift — the same correction NTP makes, at a much coarser resolution than we
 * need for a second-granularity countdown.
 */
export function syncFromResponse(dateHeader: string | null, requestStartedAt: number): void {
  if (!dateHeader) return;

  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;

  const receivedAt = Date.now();
  const halfRoundTrip = (receivedAt - requestStartedAt) / 2;
  offsetMs = serverMs + halfRoundTrip - receivedAt;
  synced = true;
}

/** `Date.now()` corrected toward server time. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/**
 * Seconds remaining until an ISO-8601 deadline, against the corrected clock.
 * Never negative — an elapsed deadline returns 0.
 */
export function secondsUntil(deadlineIso: string | null | undefined): number {
  if (!deadlineIso) return 0;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - serverNow()) / 1000));
}

/** Whether we have seen a server `Date` yet. Exposed for diagnostics and tests. */
export function isClockSynced(): boolean {
  return synced;
}

/** Test-only. Resets the module between tests. */
export function __resetServerClock(): void {
  offsetMs = 0;
  synced = false;
}
