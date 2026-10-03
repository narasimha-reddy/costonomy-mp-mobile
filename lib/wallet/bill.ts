import { ApiError, NetworkError, UploadTimeoutError } from '@/lib/api/errors';
import { formatRupees } from '@/lib/wallet/history';
import type { InvoiceCheck, InvoiceStatus, WalletInvoiceSummary } from '@/models/wallet';

/**
 * Pure rules for adding and showing a bill: what may be uploaded, how an image is shrunk,
 * how long the app waits for the reading, and the words for every state and error.
 * Nothing here calculates money: the server's `check` is shown as it arrives.
 */

export const MAX_BILL_PAGES = 5;
/** The server's limit per file. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Shrink until a picture is at most this, leaving room under the limit. */
export const TARGET_FILE_BYTES = 4.5 * 1024 * 1024;
export const MAX_LONG_SIDE = 2000;
export const START_QUALITY = 0.8;
export const MIN_QUALITY = 0.4;
export const QUALITY_STEP = 0.1;

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export const POLL_INTERVAL_MS = 2500;
export const POLL_LIMIT_MS = 90_000;

// ── Choosing files ────────────────────────────────────────────────────

/** Why a picked file cannot be added, in words for the owner; null when it can. */
export function fileProblem(file: { type?: string | null; size?: number | null; name?: string }): string | null {
  const type = (file.type ?? '').toLowerCase();
  if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return 'That file type is not supported. Use a photo (JPEG, PNG or WebP) or a PDF.';
  }
  if (type === 'application/pdf' && file.size != null && file.size > MAX_FILE_BYTES) {
    return 'That PDF is larger than 5 MB. Choose a smaller file or take a photo instead.';
  }
  return null;
}

/** How many more pages fit on this bill. */
export function pageRoom(current: number): number {
  return Math.max(0, MAX_BILL_PAGES - current);
}

/** The first `pageRoom` picked files; `dropped` is how many did not fit. */
export function fitPages<T>(current: number, picked: T[]): { accepted: T[]; dropped: number } {
  const room = pageRoom(current);
  return { accepted: picked.slice(0, room), dropped: Math.max(0, picked.length - room) };
}

// ── Shrinking ─────────────────────────────────────────────────────────

/** The resize to ask for: the long side brought down to 2000 px, or null when it is small enough already. */
export function resizePlan(width: number, height: number): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.max(width, height) <= MAX_LONG_SIDE) return null;
  return width >= height ? { width: MAX_LONG_SIDE } : { height: MAX_LONG_SIDE };
}

/**
 * What to do after a shrink pass produced `bytes` at `quality`: `done` when it fits,
 * otherwise `retry` at a lower quality, or `give-up` once quality cannot go lower.
 */
export function nextShrinkStep(
  bytes: number | null, quality: number,
): { action: 'done' } | { action: 'retry'; quality: number } | { action: 'give-up' } {
  // An unknown size cannot be checked: send it and let the server's limit speak.
  if (bytes == null || bytes <= TARGET_FILE_BYTES) return { action: 'done' };
  const lower = Math.round((quality - QUALITY_STEP) * 100) / 100;
  if (lower < MIN_QUALITY) return { action: 'give-up' };
  return { action: 'retry', quality: lower };
}

/** The file name sent with a page: the picker's own, or "bill-<n>" with the right extension. */
export function pageFileName(index: number, type: string, original?: string | null): string {
  if (original && /\.[A-Za-z0-9]{2,5}$/.test(original)) return original;
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `bill-${index + 1}.${ext}`;
}

// ── Waiting for the reading ───────────────────────────────────────────

/** Whether to ask again: only while the bill is being read and the 90 seconds are not used up. */
export function shouldPoll(status: InvoiceStatus | null | undefined, startedAt: number, now: number): boolean {
  return status === 'READING' && now - startedAt < POLL_LIMIT_MS;
}

/** TanStack's `refetchInterval` for an invoice (or summary) status: the interval, or false to stop. */
export function pollInterval(status: InvoiceStatus | null | undefined, startedAt: number, now: number): number | false {
  return shouldPoll(status, startedAt, now) ? POLL_INTERVAL_MS : false;
}

/** READING after the wait is up: we stop asking and say so. */
export function gaveUpWaiting(status: InvoiceStatus | null | undefined, startedAt: number, now: number): boolean {
  return status === 'READING' && !shouldPoll(status, startedAt, now);
}

export const STILL_READING = 'Still reading, check back later';

// ── Words for the Invoice row ─────────────────────────────────────────

export interface InvoiceRowCopy {
  state: 'reading' | 'read' | 'unreadable';
  title: string;
  subtitle: string;
}

/** The row under Transfer Details: "KOSTA Delights · ₹2,820", "Reading the bill…" or the unreadable note. */
export function invoiceRowCopy(invoice: WalletInvoiceSummary): InvoiceRowCopy {
  if (invoice.status === 'READING') return { state: 'reading', title: 'Invoice', subtitle: 'Reading the bill…' };
  if (invoice.status === 'UNREADABLE') {
    return { state: 'unreadable', title: 'Invoice', subtitle: 'Could not read, tap to view photo' };
  }
  const vendor = invoice.vendorName?.trim() || null;
  const total = invoice.total != null ? formatRupees(invoice.total) : null;
  const subtitle = vendor && total ? `${vendor} · ${total}` : vendor ?? total ?? 'Bill added, tap to view';
  return { state: 'read', title: 'Invoice', subtitle };
}

/** What the viewer's reading section says for each status. */
export function readingStateCopy(status: InvoiceStatus, error: string | null, gaveUp: boolean): string | null {
  if (status === 'READING') return gaveUp ? STILL_READING : 'Reading the bill… you can leave this page';
  if (status === 'UNREADABLE') return error?.trim() || 'We could not read this bill. You can still view the photo.';
  return null;
}

// ── The check against the payment ─────────────────────────────────────

export interface CheckBanner {
  tone: 'match' | 'differs' | 'none';
  text: string;
  /** A calm second line (never a warning), or null. */
  note?: string | null;
}

/** Green when the totals match, amber when they differ (a warning only), grey when the bill had no total. */
export function checkBanner(check: InvoiceCheck | null | undefined): CheckBanner | null {
  if (check == null) return null;
  if (check.matches === true) {
    // The review edit made it match though the bill as read did not: say what the server read, never compute it.
    const text = `Bill total matches the payment (${formatRupees(check.paid)})`;
    if (check.matchesReading === false && check.readingTotal != null) {
      return { tone: 'match', text, note: `The bill as read was ${formatRupees(check.readingTotal)}; you changed it` };
    }
    return { tone: 'match', text };
  }
  if (check.matches === false) {
    // The server sends the signed gap (bill minus payment); the banner says 'by' so the sign is dropped.
    const diff = check.difference != null ? ` by ${formatRupees(String(check.difference).replace(/^-/, ''))}` : '';
    return {
      tone: 'differs',
      text: `Bill total ${formatRupees(check.billTotal)} differs from the payment ${formatRupees(check.paid)}${diff}`,
    };
  }
  return { tone: 'none', text: 'No bill total to compare with the payment' };
}

// ── Errors ────────────────────────────────────────────────────────────

/** A plain-English sentence for whatever went wrong adding, loading or removing a bill. */
export function billErrorMessage(error: unknown): string {
  if (error instanceof UploadTimeoutError) {
    return 'The upload took too long. Check your connection and try again.';
  }
  if (error instanceof NetworkError) {
    return 'You seem to be offline. Check your connection and try again.';
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVOICE_EXISTS': return 'This payment already has a bill. Open it from the transaction page.';
      case 'INVOICE_NOT_FOUND': return 'There is no bill on this payment.';
      default: break;
    }
    switch (error.status) {
      case 401: return 'Your session has ended. Sign in again.';
      case 404: return 'We could not find this transaction.';
      case 409: return 'This payment already has a bill. Open it from the transaction page.';
      case 422: return 'A bill can only be added to a payment made from your wallet to a shop or for an order.';
      case 429: return 'You have added the most bills allowed for today. Try again tomorrow.';
      case 400: return 'We could not use those files. Use photos or a PDF up to 5 MB each, five pages at most.';
      case 413: return 'A file is too large. Each page can be up to 5 MB.';
      case 415: return 'That file type is not supported. Use a photo (JPEG, PNG or WebP) or a PDF.';
      default:
        if (error.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

/** Whether another try could work: false for the errors the owner has to act on. */
export function billErrorRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

/** A page link is usable until its expiry; a missing or unreadable date counts as expired. */
export function linkExpired(expiresAt: string | null | undefined, now: number, skewMs = 5000): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t - skewMs <= now;
}
