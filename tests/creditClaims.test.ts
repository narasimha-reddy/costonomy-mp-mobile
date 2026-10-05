import {
  CLAIM_METHODS, checkClaim, claimMethodLabel, istDay, issuedDay, referenceRequired, reportedLine, shiftDay,
  type ClaimDraft,
} from '@/lib/credit/claims';

const TODAY = '2026-10-05';
const draft = (o: Partial<ClaimDraft> = {}): ClaimDraft => ({
  amountText: '100', method: 'BANK_TRANSFER', reference: 'U1', paidOn: TODAY, note: '', ...o,
});

describe('days in India', () => {
  it('uses the India date, not the UTC one', () => {
    expect(istDay(new Date('2026-10-04T20:00:00Z'))).toBe('2026-10-05');
    expect(istDay(new Date('2026-10-04T18:29:00Z'))).toBe('2026-10-04');
  });

  it('steps across month and year ends', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('reads an issue date as a day or as an instant in India', () => {
    expect(issuedDay('2026-08-01')).toBe('2026-08-01');
    expect(issuedDay('2026-07-31T20:00:00Z')).toBe('2026-08-01');
    expect(issuedDay(null)).toBeNull();
    expect(issuedDay('not a date')).toBeNull();
  });
});

describe('checkClaim', () => {
  it.each([
    ['0.5', false, 'Enter at least ₹1.00.', null],
    ['0', false, 'Enter at least ₹1.00.', null],
    ['1', true, undefined, '1.00'],
    ['1.00', true, undefined, '1.00'],
    ['1.005', false, 'Use at most 2 decimal places.', null],
    ['2500.5', true, undefined, '2500.50'],
    ['abc', false, 'Use at most 2 decimal places.', null],
    ['', false, undefined, null],
  ])('amount %p', (amountText, valid, message, amount) => {
    const result = checkClaim(draft({ amountText }), TODAY, null);
    expect(result.valid).toBe(valid);
    expect(result.errors.amount).toBe(message);
    expect(result.amount).toBe(amount);
  });

  it('needs a reference for every method but Cash', () => {
    for (const method of CLAIM_METHODS) {
      const blank = checkClaim(draft({ method, reference: '  ' }), TODAY, null);
      expect(blank.valid).toBe(method === 'CASH');
      expect(referenceRequired(method)).toBe(method !== 'CASH');
    }
    expect(checkClaim(draft({ method: 'UPI', reference: 'abc' }), TODAY, null).valid).toBe(true);
  });

  it('blocks a future day, allows today and earlier', () => {
    expect(checkClaim(draft({ paidOn: '2026-10-06' }), TODAY, null))
      .toMatchObject({ valid: false, errors: { paidOn: 'Pick today or an earlier day.' } });
    expect(checkClaim(draft({ paidOn: TODAY }), TODAY, null).valid).toBe(true);
    expect(checkClaim(draft({ paidOn: '2026-09-01' }), TODAY, null).valid).toBe(true);
  });

  it('blocks a day before the invoice was issued', () => {
    expect(checkClaim(draft({ paidOn: '2026-07-31' }), TODAY, '2026-08-01'))
      .toMatchObject({ valid: false, errors: { paidOn: 'That is before the invoice was issued.' } });
    expect(checkClaim(draft({ paidOn: '2026-08-01' }), TODAY, '2026-08-01').valid).toBe(true);
  });
});

describe('labels', () => {
  it('uses the shared method words', () => {
    expect(CLAIM_METHODS.map(claimMethodLabel)).toEqual(['Bank transfer', 'UPI', 'Cash', 'Cheque', 'Card']);
  });

  it('words the waiting line only when something is waiting', () => {
    expect(reportedLine('1500.0000')).toBe('Payment reported: ₹1,500.00 · waiting for supplier');
    expect(reportedLine('0.0000')).toBeNull();
    expect(reportedLine(undefined)).toBeNull();
    expect(reportedLine(null)).toBeNull();
  });
});
