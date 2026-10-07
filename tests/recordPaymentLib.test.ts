import {
  cleanAmountInput, checkAmount, checkReference, checkRecord, recordBody, plainAmount, previewSummary,
  referenceRequired, RECORD_METHODS, receiptSummary,
} from '@/lib/credit/recordPayment';
import type { PaymentPreview } from '@/models/credit';

describe('cleanAmountInput', () => {
  it('strips the rupee sign, spaces and commas from a paste', () => {
    expect(cleanAmountInput('₹ 2,500.50')).toBe('2500.50');
    expect(cleanAmountInput(' 99,99,99,999.99 ')).toBe('999999999.99');
  });
  it('keeps one decimal point and drops letters and a minus sign', () => {
    expect(cleanAmountInput('1.2.3')).toBe('1.23');
    expect(cleanAmountInput('-50abc')).toBe('50');
  });
});

describe('checkAmount', () => {
  it('sends the typed amount as a two-decimal string', () => {
    expect(checkAmount('2500')).toEqual({ amount: '2500.00', error: null });
    expect(checkAmount('2500.5')).toEqual({ amount: '2500.50', error: null });
    expect(checkAmount('.5')).toEqual({ amount: '0.50', error: null });
    expect(checkAmount('007.25').amount).toBe('7.25');
  });
  it('refuses three decimals instead of rounding', () => {
    expect(checkAmount('2500.505')).toEqual({ amount: null, error: 'Use at most 2 decimal places.' });
  });
  it('refuses zero, a lone point and nothing', () => {
    expect(checkAmount('0').error).toBe('Enter an amount more than zero.');
    expect(checkAmount('0.00').error).toBe('Enter an amount more than zero.');
    expect(checkAmount('.').error).toBe('Enter an amount more than zero.');
    expect(checkAmount('').amount).toBeNull();
  });
  it('keeps a huge amount exactly as typed, as a string', () => {
    expect(checkAmount('999999999.99').amount).toBe('999999999.99');
    expect(checkAmount('12345678901234').error).toBe('That amount is too large.');
  });
});

describe('references', () => {
  it('UPI, bank transfer and cheque need one; cash and card do not', () => {
    expect(RECORD_METHODS.map((m) => [m.value, referenceRequired(m.value)])).toEqual([
      ['CASH', false], ['UPI', true], ['BANK_TRANSFER', true], ['CHEQUE', true], ['CARD', false],
    ]);
  });
  it.each(['UPI', 'BANK_TRANSFER', 'CHEQUE'] as const)('%s: empty, 3 and 65 characters are refused, 4 and 64 pass', (m) => {
    expect(checkReference(m, '')).toMatch(/Enter the payment reference/);
    expect(checkReference(m, '   ')).toMatch(/Enter the payment reference/);
    expect(checkReference(m, 'abc')).toMatch(/4 to 64/);
    expect(checkReference(m, ' abc ')).toMatch(/4 to 64/);
    expect(checkReference(m, 'a'.repeat(65))).toMatch(/4 to 64/);
    expect(checkReference(m, 'abcd')).toBeNull();
    expect(checkReference(m, ` ${'a'.repeat(64)} `)).toBeNull();
  });
  it.each(['CASH', 'CARD'] as const)('%s: optional, but 4 to 64 when given', (m) => {
    expect(checkReference(m, '')).toBeNull();
    expect(checkReference(m, '  ')).toBeNull();
    expect(checkReference(m, 'ab')).toMatch(/4 to 64/);
    expect(checkReference(m, 'a'.repeat(65))).toMatch(/4 to 64/);
    expect(checkReference(m, 'abcd')).toBeNull();
  });
});

describe('checkRecord and recordBody', () => {
  const base = { amountText: '2500', method: 'UPI' as const, reference: 'UTR12345', paidOn: '2026-10-05', note: '' };
  it('is valid with an amount, a reference and a day that is not in the future', () => {
    const c = checkRecord(base, '2026-10-06');
    expect(c.valid).toBe(true);
    expect(c.amount).toBe('2500.00');
  });
  it('refuses a day after today', () => {
    const c = checkRecord({ ...base, paidOn: '2026-10-07' }, '2026-10-06');
    expect(c.valid).toBe(false);
    expect(c.errors.paidOn).toBe('Pick today or an earlier day.');
  });
  it('refuses a note over 500 characters', () => {
    expect(checkRecord({ ...base, note: 'x'.repeat(501) }, '2026-10-06').errors.note).toMatch(/500/);
  });
  it('builds the body with a trimmed reference, a trimmed note and only the ids that were chosen', () => {
    expect(recordBody({ ...base, reference: '  UTR12345 ', note: ' hi ' }, '2500.00', [3, 4])).toEqual({
      amount: '2500.00', method: 'UPI', reference: 'UTR12345', paidOn: '2026-10-05', note: 'hi', invoiceIds: [3, 4],
    });
    expect(recordBody({ ...base, method: 'CASH', reference: '' }, '10.00', [])).toEqual({
      amount: '10.00', method: 'CASH', paidOn: '2026-10-05',
    });
  });
});

describe('plainAmount', () => {
  it('shows a server figure as a person would type it', () => {
    expect(plainAmount('2500.0000')).toBe('2500');
    expect(plainAmount('1200.5000')).toBe('1200.5');
    expect(plainAmount(7)).toBe('7');
    expect(plainAmount(null)).toBe('');
  });
});

describe('previewSummary', () => {
  const preview: PaymentPreview = {
    amount: '2500.0000',
    allocations: [
      { invoiceId: 1, invoiceNumber: 'INV-1', amount: '1000.0000', statusAfter: 'PAID' },
      { invoiceId: 2, invoiceNumber: 'INV-2', amount: '1500.0000', statusAfter: 'PARTIALLY_PAID' },
    ],
    agreement: { due: '7777.0000', overdue: '123.0000', available: '1.0000', status: 'ACTIVE' },
    pendingClaims: [],
  };
  it('words the allocations and the position from the server fields only', () => {
    const s = previewSummary(preview);
    expect(s.lines).toEqual([
      'Settles INV-1 fully (₹1,000.00)',
      'Part payment on INV-2: ₹1,500.00. It will still owe the rest.',
    ]);
    expect(s.after).toBe('After this they owe ₹7,777.00, of which ₹123.00 is overdue.');
  });
  it('says nothing about overdue when the server says none', () => {
    expect(previewSummary({ ...preview, agreement: { ...preview.agreement, overdue: '0.0000' } }).after)
      .toBe('After this they owe ₹7,777.00.');
  });
});

describe('receiptSummary', () => {
  it('words a recorded receipt with the server position', () => {
    const s = receiptSummary({
      allocations: [{ invoiceId: 1, invoiceNumber: 'INV-1', amount: '1000.0000', statusAfter: 'PAID' }],
      agreement: { due: '500.0000', overdue: '0.0000', available: '9.0000', status: 'ACTIVE' },
    });
    expect(s.lines).toEqual(['Settles INV-1 fully (₹1,000.00)']);
    expect(s.after).toBe('They now owe ₹500.00.');
  });
});
