import { ApiError, NetworkError, UploadTimeoutError } from '@/lib/api/errors';
import {
  ALLOWED_TYPES, MAX_BILL_PAGES, MAX_FILE_BYTES, POLL_INTERVAL_MS, POLL_LIMIT_MS, STILL_READING, TARGET_FILE_BYTES,
  billErrorMessage, billErrorRetryable, checkBanner, fileProblem, fitPages, gaveUpWaiting, invoiceRowCopy,
  linkExpired, nextShrinkStep, pageFileName, pageRoom, pollInterval, readingStateCopy, resizePlan, shouldPoll,
} from '@/lib/wallet/bill';

const api = (status: number, code = 'X') => new ApiError({ code, message: 'server words', status });

describe('file validation', () => {
  it('accepts the four allowed types', () => {
    for (const type of ALLOWED_TYPES) expect(fileProblem({ type, size: 1000 })).toBeNull();
  });
  it('refuses other types in plain words', () => {
    expect(fileProblem({ type: 'image/gif' })).toMatch(/not supported/);
    expect(fileProblem({ type: undefined })).toMatch(/not supported/);
  });
  it('refuses a PDF over 5 MB but allows exactly 5 MB', () => {
    expect(fileProblem({ type: 'application/pdf', size: MAX_FILE_BYTES + 1 })).toMatch(/5 MB/);
    expect(fileProblem({ type: 'application/pdf', size: MAX_FILE_BYTES })).toBeNull();
  });
  it('counts pages: five at most, extras reported', () => {
    expect(pageRoom(0)).toBe(5);
    expect(pageRoom(5)).toBe(0);
    expect(pageRoom(9)).toBe(0);
    expect(fitPages(3, ['a', 'b', 'c'])).toEqual({ accepted: ['a', 'b'], dropped: 1 });
    expect(fitPages(0, ['a'])).toEqual({ accepted: ['a'], dropped: 0 });
    expect(MAX_BILL_PAGES).toBe(5);
  });
});

describe('shrink plan', () => {
  it('leaves a small picture alone', () => {
    expect(resizePlan(2000, 1500)).toBeNull();
    expect(resizePlan(0, 0)).toBeNull();
  });
  it('brings the long side to 2000', () => {
    expect(resizePlan(4000, 3000)).toEqual({ width: 2000 });
    expect(resizePlan(3000, 4000)).toEqual({ height: 2000 });
    expect(resizePlan(2001, 2001)).toEqual({ width: 2000 });
  });
  it('steps quality down until the picture fits, then gives up', () => {
    expect(nextShrinkStep(TARGET_FILE_BYTES, 0.8)).toEqual({ action: 'done' });
    expect(nextShrinkStep(null, 0.8)).toEqual({ action: 'done' });
    expect(nextShrinkStep(TARGET_FILE_BYTES + 1, 0.8)).toEqual({ action: 'retry', quality: 0.7 });
    expect(nextShrinkStep(TARGET_FILE_BYTES + 1, 0.5)).toEqual({ action: 'retry', quality: 0.4 });
    expect(nextShrinkStep(TARGET_FILE_BYTES + 1, 0.4)).toEqual({ action: 'give-up' });
  });
  it('names pages', () => {
    expect(pageFileName(0, 'image/jpeg')).toBe('bill-1.jpg');
    expect(pageFileName(1, 'application/pdf')).toBe('bill-2.pdf');
    expect(pageFileName(1, 'image/png', 'scan.png')).toBe('scan.png');
  });
});

describe('polling rules', () => {
  it('polls only while READING and inside 90 seconds', () => {
    expect(shouldPoll('READING', 0, 1000)).toBe(true);
    expect(shouldPoll('READING', 0, POLL_LIMIT_MS)).toBe(false);
    expect(shouldPoll('READ', 0, 1000)).toBe(false);
    expect(shouldPoll('UNREADABLE', 0, 1000)).toBe(false);
    expect(shouldPoll(null, 0, 1000)).toBe(false);
  });
  it('asks every 2.5 seconds, then stops', () => {
    expect(pollInterval('READING', 0, 10)).toBe(POLL_INTERVAL_MS);
    expect(POLL_INTERVAL_MS).toBe(2500);
    expect(pollInterval('READING', 0, 91_000)).toBe(false);
    expect(pollInterval('READ', 0, 10)).toBe(false);
  });
  it('says when it has given up waiting', () => {
    expect(gaveUpWaiting('READING', 0, 91_000)).toBe(true);
    expect(gaveUpWaiting('READING', 0, 1000)).toBe(false);
    expect(gaveUpWaiting('READ', 0, 91_000)).toBe(false);
    expect(readingStateCopy('READING', null, true)).toBe(STILL_READING);
  });
});

describe('status copy', () => {
  it('shows vendor and total for a read bill', () => {
    expect(invoiceRowCopy({ status: 'READ', vendorName: 'KOSTA Delights', total: 2820, thumbnailUrl: null }))
      .toEqual({ state: 'read', title: 'Invoice', subtitle: 'KOSTA Delights · ₹2,820' });
  });
  it('copes with a missing vendor or total', () => {
    expect(invoiceRowCopy({ status: 'READ', vendorName: null, total: 90.5, thumbnailUrl: null }).subtitle).toBe('₹90.5');
    expect(invoiceRowCopy({ status: 'READ', vendorName: 'Shop', total: null, thumbnailUrl: null }).subtitle).toBe('Shop');
    expect(invoiceRowCopy({ status: 'READ', vendorName: null, total: null, thumbnailUrl: null }).subtitle).toMatch(/tap to view/);
  });
  it('words the other two states', () => {
    expect(invoiceRowCopy({ status: 'READING', vendorName: null, total: null, thumbnailUrl: null }).subtitle).toBe('Reading the bill…');
    expect(invoiceRowCopy({ status: 'UNREADABLE', vendorName: null, total: null, thumbnailUrl: null }).subtitle)
      .toBe('Could not read, tap to view photo');
  });
  it('viewer copy: reading, unreadable with the server sentence, nothing for read', () => {
    expect(readingStateCopy('READING', null, false)).toBe('Reading the bill… you can leave this page');
    expect(readingStateCopy('UNREADABLE', 'The photo is too blurry.', false)).toBe('The photo is too blurry.');
    expect(readingStateCopy('UNREADABLE', null, false)).toMatch(/could not read/i);
    expect(readingStateCopy('READ', null, false)).toBeNull();
  });
});

describe('check banner', () => {
  it('green when it matches', () => {
    expect(checkBanner({ paid: 2820, billTotal: 2820, matches: true, difference: 0 }))
      .toEqual({ tone: 'match', text: 'Bill total matches the payment (₹2,820)' });
  });
  it('amber with the server difference when it does not', () => {
    expect(checkBanner({ paid: 2820, billTotal: 2900, matches: false, difference: 80 }))
      .toEqual({ tone: 'differs', text: 'Bill total ₹2,900 differs from the payment ₹2,820 by ₹80' });
  });
  it('says the gap without a minus sign when the bill is smaller than the payment', () => {
    expect(checkBanner({ paid: 2820, billTotal: 2740, matches: false, difference: -80 })?.text)
      .toBe('Bill total ₹2,740 differs from the payment ₹2,820 by ₹80');
  });
  it('grey when the bill had no total, nothing without a check', () => {
    expect(checkBanner({ paid: 2820, billTotal: null, matches: null, difference: null })?.tone).toBe('none');
    expect(checkBanner(null)).toBeNull();
  });
});

describe('error messages', () => {
  it('maps every API error in the contract', () => {
    expect(billErrorMessage(api(409, 'INVOICE_EXISTS'))).toMatch(/already has a bill/);
    expect(billErrorMessage(api(404, 'INVOICE_NOT_FOUND'))).toMatch(/no bill/);
    expect(billErrorMessage(api(422))).toMatch(/made from your wallet/);
    expect(billErrorMessage(api(429))).toMatch(/today/);
    expect(billErrorMessage(api(400))).toMatch(/5 MB/);
    expect(billErrorMessage(api(415))).toMatch(/not supported/);
    expect(billErrorMessage(api(503))).toMatch(/our side/);
  });
  it('words offline and slow uploads', () => {
    expect(billErrorMessage(new NetworkError())).toMatch(/offline/);
    expect(billErrorMessage(new UploadTimeoutError())).toMatch(/too long/);
    expect(billErrorMessage(new Error('x'))).toMatch(/Something went wrong/);
  });
  it('offers Try again only where another try can work', () => {
    expect(billErrorRetryable(new NetworkError())).toBe(true);
    expect(billErrorRetryable(api(503))).toBe(true);
    expect(billErrorRetryable(api(409, 'INVOICE_EXISTS'))).toBe(false);
    expect(billErrorRetryable(api(422))).toBe(false);
    expect(billErrorRetryable(api(429))).toBe(false);
    expect(billErrorRetryable(api(415))).toBe(false);
  });
});

describe('link expiry', () => {
  const now = Date.parse('2026-10-03T10:00:00Z');
  it('expired, nearly expired, missing and fresh', () => {
    expect(linkExpired('2026-10-03T09:59:00Z', now)).toBe(true);
    expect(linkExpired('2026-10-03T10:00:03Z', now)).toBe(true);
    expect(linkExpired(null, now)).toBe(true);
    expect(linkExpired('nonsense', now)).toBe(true);
    expect(linkExpired('2026-10-03T10:04:00Z', now)).toBe(false);
  });
});

describe('checkBanner note when the review made the bill match (L2)', () => {
  const base = { paid: 2820, billTotal: 2820, difference: 0 };
  it('keeps the green text and adds the server reading total as a note', () => {
    const b = checkBanner({ ...base, matches: true, matchesReading: false, readingTotal: 3000 });
    expect(b?.tone).toBe('match');
    expect(b?.text).toBe('Bill total matches the payment (₹2,820)');
    expect(b?.note).toBe('The bill as read was ₹3,000; you changed it');
  });
  it('has no note when the reading matched, is unknown, or the totals differ', () => {
    expect(checkBanner({ ...base, matches: true, matchesReading: true, readingTotal: 2820 })?.note ?? null).toBeNull();
    expect(checkBanner({ ...base, matches: true, matchesReading: null, readingTotal: 3000 })?.note ?? null).toBeNull();
    expect(checkBanner({ ...base, matches: true, readingTotal: 3000 })?.note ?? null).toBeNull();
    expect(checkBanner({ ...base, matches: false, difference: 80, matchesReading: false, readingTotal: 3000 })?.note ?? null).toBeNull();
    expect(checkBanner({ ...base, matches: true, matchesReading: false, readingTotal: null })?.note ?? null).toBeNull();
  });
});
