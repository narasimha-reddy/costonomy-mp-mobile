/**
 * Reading a UPI payment code. QuickScan spec, app side.
 *
 * <p>Handles two shapes a restaurant can produce: a scanned or uploaded QR whose
 * payload is a UPI deep link (`upi://pay?pa=...`), and a UPI ID typed or pasted
 * by hand (`shop@bank`). Both come out the same shape, so the screen that calls
 * this never needs to know which one it got.
 *
 * <p><b>Pure and inert.</b> This never opens, fetches or evaluates the text —
 * only reads a handful of named query parameters out of it. A QR code is
 * attacker-controlled input by nature; the only thing done with it here is
 * string matching.
 *
 * <p>The VPA shape matches the server's validator exactly (`^[a-zA-Z0-9.\-_]
 * {2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$`) so a code this accepts is never one the
 * `quickscan/payments` endpoint then refuses on `payeeVpa` alone.
 */

export interface ParsedUpiPayment {
  ok: true;
  vpa: string;
  /** The payee's display name, if the code carried one. Trimmed, capped at 100 chars. */
  name?: string;
  /** Rupees, as a decimal string — only present when the code fixed an amount. */
  amount?: string;
  /** A payment note/purpose, if the code carried one. Trimmed, capped at 200 chars. */
  note?: string;
}

export interface ParsedUpiFailure {
  ok: false;
  /** A sentence for the screen to show inline, next to the scan or the field. */
  reason: string;
}

export type ParsedUpi = ParsedUpiPayment | ParsedUpiFailure;

/** Matches `TrustDtos`/`QuickScanDtos`' `payeeVpa` validator on the server, verbatim. */
const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** Rupees, at most two decimal places, strictly positive. Shape only — same as `isAmount`. */
const AMOUNT_PATTERN = /^\d{1,13}(\.\d{1,2})?$/;

const REASON_NOT_UPI = 'That doesn’t look like a UPI code.';
const REASON_MISSING_VPA = 'That code doesn’t have a UPI ID on it.';
const REASON_INVALID_VPA = 'That UPI ID doesn’t look right.';
const REASON_NON_INR = 'Only rupee payments are supported';
const REASON_BAD_AMOUNT = 'That amount doesn’t look right.';

const UPI_URI = /^upi:\/\/pay(?:\?(.*))?$/i;

/**
 * Parse a scanned/uploaded QR payload or a hand-typed UPI ID.
 *
 * <p>Tries the deep-link shape first (`upi://pay?...`, scheme case-insensitive),
 * then falls back to treating the whole string as a bare VPA. Anything else is
 * "not a UPI code" — including a QR that encodes something else entirely, e.g. a
 * product barcode.
 */
export function parseUpiQr(raw: string): ParsedUpi {
  const text = raw.trim();
  if (text === '') return { ok: false, reason: REASON_MISSING_VPA };

  const uriMatch = UPI_URI.exec(text);
  if (uriMatch) return parseUpiUri(uriMatch[1] ?? '');

  if (text.includes('@')) return parseBareVpa(text);

  return { ok: false, reason: REASON_NOT_UPI };
}

function parseUpiUri(query: string): ParsedUpi {
  const params = new URLSearchParams(query);

  const pa = (params.get('pa') ?? '').trim();
  if (pa === '') return { ok: false, reason: REASON_MISSING_VPA };
  if (!VPA_PATTERN.test(pa)) return { ok: false, reason: REASON_INVALID_VPA };

  const cu = (params.get('cu') ?? '').trim();
  if (cu !== '' && cu.toUpperCase() !== 'INR') {
    return { ok: false, reason: REASON_NON_INR };
  }

  const result: ParsedUpiPayment = { ok: true, vpa: pa };

  const pn = (params.get('pn') ?? '').trim();
  if (pn !== '') result.name = pn.slice(0, 100);

  const am = (params.get('am') ?? '').trim();
  if (am !== '') {
    if (!isValidRupeeAmount(am)) return { ok: false, reason: REASON_BAD_AMOUNT };
    result.amount = am;
  }

  const tn = (params.get('tn') ?? '').trim();
  if (tn !== '') result.note = tn.slice(0, 200);

  return result;
}

function parseBareVpa(text: string): ParsedUpi {
  if (!VPA_PATTERN.test(text)) return { ok: false, reason: REASON_INVALID_VPA };
  return { ok: true, vpa: text };
}

function isValidRupeeAmount(text: string): boolean {
  return AMOUNT_PATTERN.test(text) && Number(text) > 0;
}
