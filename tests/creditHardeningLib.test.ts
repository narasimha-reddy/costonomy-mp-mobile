import { ApiError } from '@/lib/api/errors';
import {
  isDefinitiveFailure, isKeyReuse, isPreviousAttemptFailed, isStillProcessing,
} from '@/lib/api/idempotency';
import { attemptKey, hasAttempt, resetAttemptKeys, settleAttempt } from '@/lib/credit/attemptKeys';
import { checkClaim, istDay } from '@/lib/credit/claims';
import { differenceAmounts, sameAmount, sliverLeft, sumAmounts } from '@/lib/credit/sum';
import { addChip, scaledToAmount, toScaled } from '@/lib/wallet/amount';

const err = (status: number, code: string) => new ApiError({ code, message: 'm', status });

describe('scaledToAmount never rounds up (B13 / M12)', () => {
  it('truncates paise instead of rounding without a carry', () => {
    expect(scaledToAmount(1_009_950)).toBe('100.99');
    expect(scaledToAmount(1_000_050)).toBe('100.00');
    expect(scaledToAmount(1_000_099)).toBe('100.00');
    expect(scaledToAmount(1_000_100)).toBe('100.01');
    expect(scaledToAmount(9_999)).toBe('0.99');
    expect(scaledToAmount(99)).toBe('0.00');
  });

  it('is exact for every two-decimal amount (round trip), over a dense range', () => {
    for (let paise = 0; paise <= 250_000; paise += 37) {
      const text = `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
      const scaled = toScaled(text, 2) as number;
      expect(scaledToAmount(scaled)).toBe(text);
    }
  });

  it('never exceeds its input, always has exactly two decimals and never reads as 3 digits of paise', () => {
    let seed = 12345;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    for (let i = 0; i < 5000; i++) {
      const scaled = next() % 2_000_000_000;
      const text = scaledToAmount(scaled);
      expect(text).toMatch(/^\d+\.\d{2}$/);
      expect(toScaled(text, 2) as number).toBeLessThanOrEqual(scaled);
      expect(scaled - (toScaled(text, 2) as number)).toBeLessThan(100);
    }
  });

  it('is safe for negative and fractional input', () => {
    expect(scaledToAmount(-5)).toBe('0.00');
    expect(scaledToAmount(1_009_950.9)).toBe('100.99');
  });

  it('addChip keeps two-decimal text exact', () => {
    expect(addChip('100.99', 500)).toBe('600.99');
    expect(addChip('', 500)).toBe('500');
  });
});

describe('sub-₹1 helpers (M03 / B5)', () => {
  it('sliverLeft names a leftover under ₹1 and nothing else', () => {
    expect(sliverLeft('1000.0000', '999.50')).toBe('0.50');
    expect(sliverLeft('1000.0000', '999.99')).toBe('0.01');
    expect(sliverLeft('1000.0000', '999')).toBeNull();       // leaves exactly 1.00
    expect(sliverLeft('1000.0000', '1000')).toBeNull();      // clears it
    expect(sliverLeft('1000.0000', '1200')).toBeNull();      // more than owed: server's refusal
    expect(sliverLeft('1000.0000', '500')).toBeNull();
    expect(sliverLeft('abc', '5')).toBeNull();
  });

  it('differenceAmounts and sameAmount are integer comparisons', () => {
    expect(differenceAmounts('0.30', '0.10')).toBe('0.20');
    expect(differenceAmounts('0.1', '0.2')).toBeNull();
    expect(sumAmounts(['0.1', '0.2'])).toBe('0.30');
    expect(sameAmount('0.5', 0.5)).toBe(true);
    expect(sameAmount('0.5000', '0.50')).toBe(true);
    expect(sameAmount('0.5', '0.51')).toBe(false);
    expect(sameAmount(null, 1)).toBe(false);
  });

  const draft = (amountText: string) => ({
    amountText, method: 'CASH' as const, reference: '', paidOn: istDay(), note: '',
  });

  it('claim: below ₹1 only when it is exactly the reportable amount', () => {
    const today = istDay();
    expect(checkClaim(draft('0.50'), today, null, 0.5)).toMatchObject({ valid: true, amount: '0.50' });
    expect(checkClaim(draft('0.50'), today, null, 0.6)).toMatchObject({ valid: false, amount: null });
    expect(checkClaim(draft('0.50'), today, null).errors.amount).toBe('Enter at least ₹1.00.');
    expect(checkClaim(draft('0.50'), today, null, undefined).valid).toBe(false);
    expect(checkClaim(draft('0'), today, null, 0).valid).toBe(false);
    expect(checkClaim(draft('1'), today, null, 0.5).valid).toBe(true);
  });
});

describe('idempotency outcomes', () => {
  it('classifies the three key answers', () => {
    expect(isKeyReuse(err(409, 'IDEMPOTENCY_KEY_REUSE'))).toBe(true);
    expect(isStillProcessing(err(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS'))).toBe(true);
    expect(isPreviousAttemptFailed(err(409, 'IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED'))).toBe(true);
    expect(isKeyReuse(new Error('x'))).toBe(false);
  });

  it('previous-attempt-failed and key reuse are definitive; in progress, 5xx, 429 and network are not', () => {
    expect(isDefinitiveFailure(err(409, 'IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED'))).toBe(true);
    expect(isDefinitiveFailure(err(409, 'IDEMPOTENCY_KEY_REUSE'))).toBe(true);
    expect(isDefinitiveFailure(err(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS'))).toBe(false);
    expect(isDefinitiveFailure(err(503, 'X'))).toBe(false);
    expect(isDefinitiveFailure(err(429, 'X'))).toBe(false);
    expect(isDefinitiveFailure(new TypeError('Network request failed'))).toBe(false);
    expect(isDefinitiveFailure(err(403, 'WALLET_ON_HOLD'))).toBe(true);
  });
});

describe('attempt key store', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('holds one key per signature until it is settled', () => {
    const a = attemptKey('pay|7|3|500.00|');
    expect(attemptKey('pay|7|3|500.00|')).toBe(a);
    expect(attemptKey('pay|7|3|600.00|')).not.toBe(a);
    expect(hasAttempt('pay|7|3|500.00|')).toBe(true);
    settleAttempt('pay|7|3|500.00|');
    expect(hasAttempt('pay|7|3|500.00|')).toBe(false);
    expect(attemptKey('pay|7|3|500.00|')).not.toBe(a);
  });

  it('gives a new key once the state it was made against has changed', () => {
    const a = attemptKey('s', '1200|500');
    expect(attemptKey('s', '1200|500')).toBe(a);
    expect(attemptKey('s', '700|0')).not.toBe(a);
  });

  it('forgets an attempt after half an hour', () => {
    const start = Date.now();
    const a = attemptKey('old');
    jest.spyOn(Date, 'now').mockReturnValue(start + 31 * 60 * 1000);
    expect(attemptKey('old')).not.toBe(a);
  });

  it('resetAttemptKeys forgets everything', () => {
    attemptKey('x');
    resetAttemptKeys();
    expect(hasAttempt('x')).toBe(false);
  });
});
