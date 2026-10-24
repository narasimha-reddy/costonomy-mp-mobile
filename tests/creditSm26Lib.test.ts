import { ApiError } from '@/lib/api/errors';
import { dayMonth, istDayMonth, istTime, istDayTime } from '@/lib/credit/istFormat';
import {
  QUICK_REASONS, cancelledOnText, mayUndo, reversalErrorText, undoUntilText,
} from '@/lib/credit/reversal';
import {
  channelsText, historyKind, historyStatus, limitMessage, preflightMessage, queuedText, reminderErrorText,
  skipReasonText, blockedText,
} from '@/lib/credit/remind';
import { statementDetail } from '@/lib/credit/statement';
import type { CreditStatementLine } from '@/models/credit';

const err = (code: string, status: number, details?: Record<string, unknown>, message = 'server words') =>
  new ApiError({ code, status, message, details });

describe('IST formatting', () => {
  it('words an India date without any timezone shift', () => {
    expect(dayMonth('2026-10-12')).toBe('12th Oct');
    expect(dayMonth('2026-10-01')).toBe('1st Oct');
    expect(dayMonth('2026-10-22')).toBe('22nd Oct');
    expect(dayMonth('2026-10-23')).toBe('23rd Oct');
    expect(dayMonth('2026-10-11')).toBe('11th Oct');
    expect(dayMonth('nonsense')).toBeNull();
    expect(dayMonth(null)).toBeNull();
  });
  it('words an instant in India time (an evening UTC instant is already tomorrow in IST)', () => {
    expect(istDayMonth('2026-10-06T20:00:00Z')).toBe('7th Oct');
    expect(istTime('2026-10-07T03:30:00Z')).toBe('9 am');
    expect(istTime('2026-10-07T10:00:00Z')).toBe('3:30 pm');
    expect(istTime('2026-10-06T18:30:00Z')).toBe('12 am');
    expect(istTime('2026-10-06T06:30:00Z')).toBe('12 pm');
    expect(istDayTime('2026-10-07T10:00:00Z')).toBe('7th Oct, 3:30 pm');
    expect(istDayTime(null)).toBeNull();
  });
});

describe('undo rules', () => {
  const base = { reversible: true, reversedAt: null };
  it('offers Undo only when the server says reversible, nothing is reversed and the person may', () => {
    expect(mayUndo({ ...base }, true)).toBe(true);
    expect(mayUndo({ ...base }, false)).toBe(false);
    expect(mayUndo({ reversible: false, reversedAt: null }, true)).toBe(false);
    expect(mayUndo({ reversible: undefined, reversedAt: null }, true)).toBe(false);
    expect(mayUndo({ reversible: true, reversedAt: '2026-10-05T10:00:00Z' }, true)).toBe(false);
  });
  it('words the window and the cancellation', () => {
    expect(undoUntilText('2026-10-12')).toBe('Undo until 12th Oct');
    expect(undoUntilText(null)).toBeNull();
    expect(cancelledOnText('2026-10-05T10:00:00Z')).toBe('Cancelled on 5th Oct');
  });
  it('offers the four quick reasons', () => {
    expect(QUICK_REASONS).toEqual(['Typed the wrong amount', 'Wrong restaurant', 'Cheque bounced', 'Other']);
  });
});

describe('reversalErrorText', () => {
  it('maps every refusal to plain words', () => {
    expect(reversalErrorText(err('CREDIT_REVERSAL_NOT_ALLOWED', 409)))
      .toMatch(/can't be undone/i);
    expect(reversalErrorText(err('CREDIT_REVERSAL_WINDOW_CLOSED', 409, { closedOn: '2026-10-13', reversibleUntil: '2026-10-12' })))
      .toBe('It is too late to undo this payment. It could be undone until 12th Oct.');
    expect(reversalErrorText(err('CREDIT_ALREADY_REVERSED', 409))).toBe('This payment was already cancelled.');
    expect(reversalErrorText(err('CREDIT_REVERSAL_NO_HEADROOM', 422, { needed: 5000, available: 3000, shortBy: 2000 })))
      .toBe('Raise their limit by ₹2,000.00 first, or suspend the line.');
    expect(reversalErrorText(err('CREDIT_REVERSAL_NO_HEADROOM', 422, { shortBy: '1250.5' })))
      .toBe('Raise their limit by ₹1,250.50 first, or suspend the line.');
    expect(reversalErrorText(err('VALIDATION_FAILED', 400, undefined, 'Give a reason of 3 to 500 characters')))
      .toBe('Give a reason of 3 to 500 characters');
    expect(reversalErrorText(err('FORBIDDEN', 403))).toMatch(/permission/i);
    expect(reversalErrorText(err('NOT_FOUND', 404))).toMatch(/no longer available/i);
    expect(reversalErrorText(err('IDEMPOTENCY_KEY_REUSE', 409))).toMatch(/may have gone through/i);
    expect(reversalErrorText(new Error('net'))).toMatch(/try again/i);
  });
});

describe('reminder wording', () => {
  it('words channels', () => {
    expect(channelsText(['IN_APP', 'PUSH'])).toBe('In the app and as a notification');
    expect(channelsText(['IN_APP', 'PUSH', 'SMS'])).toBe('In the app and as a notification, and an SMS because it is overdue');
    expect(channelsText(['IN_APP'])).toBe('In the app');
    expect(channelsText([])).toBe('');
  });
  it('words queued sends in IST from the server time', () => {
    expect(queuedText('2026-10-07T03:30:00Z')).toBe('It will be sent at 9 am on 7th Oct.');
    expect(queuedText(null)).toBe('It will be sent at 9 am.');
  });
  it('words skipped invoices and blocked reasons', () => {
    expect(skipReasonText('CLAIM_SUBMITTED')).toBe('They already say they paid this');
    expect(skipReasonText('NOT_DUE')).toBe('Not due yet');
    expect(blockedText('NOTHING_DUE', null)).toMatch(/nothing is due/i);
    expect(blockedText('CLAIM_COVERED', null)).toMatch(/say they have paid/i);
    expect(blockedText('TOO_SOON', '2026-10-07T10:00:00Z')).toBe('You can remind again at 3:30 pm on 7th Oct.');
    expect(blockedText('WEEK_LIMIT', '2026-10-07T10:00:00Z')).toMatch(/3 reminders a week.*7th Oct/);
    expect(blockedText('STORE_DAY_LIMIT', '2026-10-07T10:00:00Z')).toMatch(/50 reminders a day.*7th Oct/);
    expect(blockedText('SOMETHING_NEW', null)).toMatch(/can't be sent/i);
  });
  it('words history kinds and statuses', () => {
    expect(historyKind('MANUAL')).toBe('Manual');
    expect(historyKind('AUTO_T3')).toBe('Automatic before due');
    expect(historyKind('AUTO_DUE')).toBe('Due today');
    expect(historyKind('AUTO_WEEKLY')).toBe('Weekly');
    expect(historyStatus('SENT')).toBe('Sent');
    expect(historyStatus('QUEUED')).toBe('Waiting to send');
  });
  it('words every send refusal', () => {
    expect(reminderErrorText(err('CREDIT_REMINDER_TOO_SOON', 429, { nextAllowedAt: '2026-10-07T10:00:00Z' })))
      .toBe('You can remind again at 3:30 pm on 7th Oct.');
    expect(reminderErrorText(err('CREDIT_REMINDER_LIMIT', 429, { limit: 'WEEK', max: 3, nextAllowedAt: '2026-10-09T04:00:00Z' })))
      .toBe(limitMessage('WEEK', '2026-10-09T04:00:00Z'));
    expect(reminderErrorText(err('CREDIT_REMINDER_LIMIT', 429, { limit: 'STORE_DAY', max: 50, nextAllowedAt: '2026-10-07T03:30:00Z' })))
      .toMatch(/50 reminders a day/);
    expect(reminderErrorText(err('CREDIT_REMINDER_NOT_NEEDED', 422, { reason: 'NOTHING_DUE', skipped: [] })))
      .toMatch(/nothing is due/i);
    expect(reminderErrorText(err('IDEMPOTENCY_KEY_REUSE', 409))).toMatch(/may have been sent/i);
    expect(reminderErrorText(err('FORBIDDEN', 403))).toMatch(/permission/i);
    expect(reminderErrorText(err('VALIDATION_FAILED', 400, undefined, 'Keep the note to 300 characters')))
      .toBe('Keep the note to 300 characters');
    expect(reminderErrorText(new Error('x'))).toMatch(/try again/i);
  });
  it('preflight refuses when the preview says no', () => {
    expect(preflightMessage({ canRemind: false, reason: 'TOO_SOON', nextAllowedAt: '2026-10-07T10:00:00Z' }))
      .toMatch(/remind again/);
    expect(preflightMessage({ canRemind: true, reason: null, nextAllowedAt: null })).toBeNull();
  });
});

describe('statement reversal line', () => {
  const line = (over: Partial<CreditStatementLine>): CreditStatementLine => ({
    at: '2026-10-05T10:00:00Z', type: 'PAYMENT_REVERSED', label: 'Payment reversed', amount: '1500.0000',
    owedAfter: '7500.0000', supplierOrderId: null, orderNumber: null, creditInvoiceId: 4, invoiceNumber: 'INV-4',
    source: null, method: null, reference: null, walletEntryId: null, ...over,
  });
  it('says what a reversed payment line is', () => {
    expect(statementDetail(line({}))).toBe('INV-4 · Payment cancelled, owed again');
  });
});
