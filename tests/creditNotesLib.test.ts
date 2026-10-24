import { ApiError } from '@/lib/api/errors';
import {
  CREDIT_NOTE_REASONS, creditNoteErrorText, creditNoteLine, creditedRowValue, hasCredit, invoiceChip,
  invoiceStatusText, mayIssueCreditNote, mayWriteOff, noteBody, refundErrorText, reasonWords,
  settledByCreditNote, writeOffBody, writeOffConsequence, writeOffErrorText, WRITE_OFF_QUICK_REASONS,
} from '@/lib/credit/creditNotes';
import { statementDetail } from '@/lib/credit/statement';
import { applyLineFilters, TYPE_OPTIONS } from '@/lib/credit/statementFilters';
import type { CreditNote, CreditStatementLine } from '@/models/credit';

const err = (code: string, status: number, details?: Record<string, unknown>, message = 'server words') =>
  new ApiError({ code, status, message, details });

describe('invoices fully settled by a credit note', () => {
  const credited = { status: 'PAID', paidAmount: '0.0000', creditedAmount: '7000.0000', dueState: 'PAID' } as const;
  it('is PAID with nothing paid and something credited', () => {
    expect(settledByCreditNote(credited)).toBe(true);
    expect(settledByCreditNote({ ...credited, paidAmount: '2500.0000' })).toBe(false);
    expect(settledByCreditNote({ ...credited, creditedAmount: '0.0000' })).toBe(false);
    expect(settledByCreditNote({ ...credited, creditedAmount: undefined })).toBe(false);
    expect(settledByCreditNote({ ...credited, status: 'PARTIALLY_PAID' })).toBe(false);
  });
  it('reads "Settled by credit note", never "Paid", on the chip and the status line', () => {
    expect(invoiceChip({ ...credited, daysToDue: null })).toEqual({ label: 'Settled by credit note', tone: 'success' });
    expect(invoiceStatusText(credited)).toBe('Settled by credit note');
  });
  it('keeps the usual words for everything else', () => {
    const paid = { status: 'PAID', paidAmount: '7000.0000', creditedAmount: '0.0000', dueState: 'PAID', daysToDue: null } as const;
    expect(invoiceChip(paid)).toEqual({ label: 'Paid', tone: 'success' });
    expect(invoiceStatusText(paid)).toBe('Paid');
    expect(invoiceStatusText({ status: 'PARTIALLY_PAID', paidAmount: '1', creditedAmount: '500', dueState: 'DUE_SOON' })).toBe('Part paid');
    expect(invoiceChip({ status: 'ISSUED', paidAmount: '0', creditedAmount: '0', dueState: 'OVERDUE', daysToDue: -3 })?.label).toBe('Overdue');
  });
  it('shows a credit row only when something was credited', () => {
    expect(hasCredit({ creditedAmount: '2100.0000' })).toBe(true);
    expect(hasCredit({ creditedAmount: '0.0000' })).toBe(false);
    expect(hasCredit({})).toBe(false);
    expect(creditedRowValue('2100.0000')).toBe('−₹2,100.00');
  });
});

describe('who may do what', () => {
  const store = { id: 5, supplierOrganizationId: 1 };
  const can = (granted: string[]) => (p: string) => granted.includes(p);
  it('issues credit notes with CREDIT_COLLECT or CREDIT_MODIFY, and only on an open invoice that is owed', () => {
    const open = { status: 'ISSUED', outstanding: '100.0000' };
    expect(mayIssueCreditNote(open, can(['CREDIT_COLLECT']), store)).toBe(true);
    expect(mayIssueCreditNote(open, can(['CREDIT_MODIFY']), store)).toBe(true);
    expect(mayIssueCreditNote(open, can(['CREDIT_VIEW']), store)).toBe(false);
    expect(mayIssueCreditNote({ ...open, status: 'PAID' }, can(['CREDIT_COLLECT']), store)).toBe(false);
    expect(mayIssueCreditNote({ ...open, status: 'WRITTEN_OFF' }, can(['CREDIT_COLLECT']), store)).toBe(false);
    expect(mayIssueCreditNote({ ...open, outstanding: '0.0000' }, can(['CREDIT_COLLECT']), store)).toBe(false);
  });
  it('writes off with CREDIT_WRITE_OFF alone (collect and modify are not enough)', () => {
    expect(mayWriteOff(can(['CREDIT_WRITE_OFF']), store)).toBe(true);
    expect(mayWriteOff(can(['CREDIT_COLLECT', 'CREDIT_MODIFY']), store)).toBe(false);
    expect(mayWriteOff(can(['CREDIT_WRITE_OFF']), null)).toBe(false);
  });
});

describe('credit note request', () => {
  it('offers the six reasons in plain words', () => {
    expect(CREDIT_NOTE_REASONS.map((r) => r.label)).toEqual([
      'Short supply', 'Quality problem', 'Price difference', 'Cancelled order', 'Goodwill', 'Other']);
    expect(CREDIT_NOTE_REASONS.map((r) => r.value)).toEqual([
      'SHORT_SUPPLY', 'QUALITY', 'PRICE', 'CANCELLED', 'GOODWILL', 'OTHER']);
    expect(reasonWords('QUALITY')).toBe('Quality problem');
  });
  it('sends the amount as the string typed, the code, and a note only when written', () => {
    expect(noteBody('2100.00', 'PRICE', '')).toEqual({ amount: '2100.00', reasonCode: 'PRICE' });
    expect(noteBody('2100.00', 'PRICE', '  rate was lower ')).toEqual({ amount: '2100.00', reasonCode: 'PRICE', note: 'rate was lower' });
  });
});

describe('credit note errors', () => {
  it('quotes the server outstanding when the amount is too high', () => {
    const text = creditNoteErrorText(err('CREDIT_NOTE_EXCEEDS_OUTSTANDING', 422, { outstanding: '4900.0000' }));
    expect(text).toContain('₹4,900.00');
    expect(text).not.toMatch(/CREDIT_NOTE/);
  });
  it('says what to do when the invoice is already settled', () => {
    expect(creditNoteErrorText(err('CREDIT_NOTE_INVOICE_SETTLED', 409))).toMatch(/already settled.*refund the restaurant directly/i);
  });
  it('words a spent key as "may have gone through"', () => {
    expect(creditNoteErrorText(err('IDEMPOTENCY_KEY_REUSE', 409))).toMatch(/may have gone through/i);
  });
  it('passes a validation message through, and words anything else plainly', () => {
    expect(creditNoteErrorText(err('VALIDATION_ERROR', 400, undefined, 'Use at most two decimal places'))).toBe('Use at most two decimal places');
    expect(creditNoteErrorText(err('X', 404))).toMatch(/no longer available/i);
    expect(creditNoteErrorText(new Error('boom'))).toMatch(/try again/i);
  });
});

describe('write-off request', () => {
  it('offers the four quick reasons', () => {
    expect(WRITE_OFF_QUICK_REASONS.map((r) => r.value)).toEqual(['RESTAURANT_CLOSED', 'UNRECOVERABLE', 'SETTLED_OUTSIDE', 'GOODWILL']);
    expect(WRITE_OFF_QUICK_REASONS.map((r) => r.label)).toEqual(['Restaurant closed', 'Unrecoverable', 'Settled outside', 'Goodwill']);
  });
  it('leaves the amount out when none is typed, and keepLineOpen out unless on', () => {
    expect(writeOffBody({ amount: null, reason: ' Closed down ', quick: null, keepLineOpen: false }))
      .toEqual({ reason: 'Closed down' });
    expect(writeOffBody({ amount: '2000.00', reason: 'r r r', quick: 'UNRECOVERABLE', keepLineOpen: true }))
      .toEqual({ amount: '2000.00', reason: 'r r r', quickReason: 'UNRECOVERABLE', keepLineOpen: true });
  });
  it('words the consequence with the amount on screen and no arithmetic', () => {
    expect(writeOffConsequence('12000.0000', false))
      .toBe('₹12,000.00 will no longer be owed. This cannot be undone in the app. Their credit line will be paused.');
    expect(writeOffConsequence('12000.0000', true))
      .toBe('₹12,000.00 will no longer be owed. This cannot be undone in the app. Their credit line will stay open.');
  });
  it('words the refusals', () => {
    expect(writeOffErrorText(err('CREDIT_WRITE_OFF_NOTHING_OWED', 409))).toMatch(/nothing is owed/i);
    expect(writeOffErrorText(err('CREDIT_NOTE_EXCEEDS_OUTSTANDING', 422, { outstanding: '10000.0000' }))).toContain('₹10,000.00');
    expect(writeOffErrorText(err('X', 404))).toMatch(/no longer available/i);
  });
  it('tells a wallet refund that our team settles it', () => {
    expect(refundErrorText(err('CREDIT_REFUND_OPS_ONLY', 409))).toBe('Our team will settle this one.');
  });
});

describe('credit note lines', () => {
  const note = (over: Partial<CreditNote> = {}): CreditNote => ({
    id: 1, creditNoteNumber: 'CN-261006-000001', invoiceId: 11, invoiceNumber: 'INV-11', agreementId: 3,
    amount: '2100.0000', reasonCode: 'QUALITY', kind: 'MANUAL', note: null, disputeId: null, createdBy: 9,
    createdAt: '2026-10-06T10:00:00Z', ...over,
  });
  it('says the reason in plain words for a manual note', () => {
    expect(creditNoteLine(note())).toEqual({ title: 'CN-261006-000001', reason: 'Quality problem', detail: null });
  });
  it('says an automatic cancel note was issued automatically', () => {
    expect(creditNoteLine(note({ kind: 'SYSTEM_CANCEL', reasonCode: 'CANCELLED', createdBy: null })).reason)
      .toBe('Order cancelled: credit note issued automatically');
  });
  it('calls a write-off a write-off and shows the supplier note', () => {
    const line = creditNoteLine(note({ kind: 'WRITE_OFF', reasonCode: 'OTHER', note: 'Restaurant closed' }));
    expect(line.reason).toBe('Written off');
    expect(line.detail).toBe('Restaurant closed');
  });
});

describe('statement', () => {
  const line = (over: Partial<CreditStatementLine>): CreditStatementLine => ({
    at: '2026-10-06T10:00:00Z', type: 'CREDIT_NOTE', label: 'Credit note', amount: '-2100.0000', owedAfter: '4900.0000',
    supplierOrderId: null, orderNumber: null, creditInvoiceId: 11, invoiceNumber: 'INV-11', source: null, method: null,
    reference: null, walletEntryId: null, creditNoteNumber: 'CN-261006-000001', ...over,
  });
  it('shows the credit note number under the server label', () => {
    expect(statementDetail(line({}))).toBe('INV-11 · CN-261006-000001');
    expect(statementDetail(line({ type: 'WRITE_OFF', label: 'Written off' }))).toBe('INV-11 · CN-261006-000001');
  });
  it('adds Credit notes, Write-offs and Reversals to the Type filter', () => {
    expect(TYPE_OPTIONS.map((o) => o.label)).toEqual([
      'Orders on credit', 'Repayments', 'Credit notes', 'Write-offs', 'Reversals']);
    const lines = [
      line({}), line({ type: 'WRITE_OFF', label: 'Written off' }),
      line({ type: 'PAYMENT_REVERSED', label: 'Payment reversed', creditNoteNumber: null }),
      line({ type: 'REPAYMENT', label: 'Repayment', creditNoteNumber: null }),
    ];
    expect(applyLineFilters(lines, { types: ['CREDIT_NOTES'], paidBy: [] }).map((l) => l.type)).toEqual(['CREDIT_NOTE']);
    expect(applyLineFilters(lines, { types: ['WRITE_OFFS'], paidBy: [] }).map((l) => l.type)).toEqual(['WRITE_OFF']);
    expect(applyLineFilters(lines, { types: ['REVERSALS'], paidBy: [] }).map((l) => l.type)).toEqual(['PAYMENT_REVERSED']);
    expect(applyLineFilters(lines, { types: ['REPAYMENTS', 'CREDIT_NOTES'], paidBy: [] }).map((l) => l.type))
      .toEqual(['CREDIT_NOTE', 'REPAYMENT']);
  });
});
