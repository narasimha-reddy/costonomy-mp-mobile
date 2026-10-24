import { ApiError } from '@/lib/api/errors';

/**
 * What to tell somebody when a tax invoice or credit note call fails (API D-133).
 *
 * <p>The server's answer is the reason, so it is shown, not replaced by a guess: an invoice that cannot be issued
 * because the supplier's GSTIN is missing has to say so. The routes answer 404 for everyone while tax invoices are
 * switched off (the default), which reads as "not available", not as a fault.
 */

const FIELD_WORDS: [RegExp, string][] = [
  [/^supplier\.legalName/, 'your registered legal name'],
  [/^supplier\.gstin/, 'your GSTIN'],
  [/^supplier\.address/, 'your store address'],
  [/^supplier\.state/, 'your store\'s state'],
  [/^buyer\.name/, 'the restaurant\'s name'],
  [/^buyer\.address/, 'the outlet\'s address'],
  [/^buyer\.placeOfSupply/, 'the outlet\'s state'],
  [/^line\[\d+ ?(.*)\]\.hsnCode/, 'an HSN code'],
  [/^line\[\d+ ?(.*)\]\.productName/, 'a product name'],
  [/^line\[\d+ ?(.*)\]\.unit/, 'a unit'],
];

/** One missing field path from the server, in words. Unknown paths are shown as sent, never dropped. */
export function describeMissing(path: string): string {
  for (const [pattern, words] of FIELD_WORDS) {
    const match = pattern.exec(path);
    if (match) {
      const product = match[1];
      return product ? `${words} for ${product}` : words;
    }
  }
  return path;
}

export function billingFailureMessage(caught: unknown, fallback: string): string {
  if (!(caught instanceof ApiError)) return fallback;

  if (caught.code === 'TAX_INVOICE_DATA_MISSING') {
    const missing = caught.details?.missing;
    if (Array.isArray(missing) && missing.length > 0) {
      return `This invoice can't be issued yet. Add ${missing.map((path) => describeMissing(String(path))).join(', ')}.`;
    }
    return caught.message;
  }
  if (caught.code === 'TAX_INVOICE_NOT_ALLOWED') return caught.message;
  if (caught.status === 404) return "Tax invoices aren't available for this order yet.";
  return caught.message || fallback;
}

/**
 * What the Credit notes button says when the call fails. The routes answer 404 for everyone while tax invoices are
 * switched off, and a store with nothing issued has the same answer for the person asking: no credit notes yet.
 */
export function creditNotesNotice(caught: unknown): string {
  if (caught instanceof ApiError && caught.status === 404) return 'No credit notes yet.';
  return billingFailureMessage(caught, 'Could not load credit notes for this order.');
}
