import { addChip, checkTopUp, scaledToAmount, toScaled, TOP_UP_CHIPS } from '@/lib/wallet/amount';
import type { WalletLimits } from '@/models/wallet';

const LIMITS: WalletLimits = {
  maxBalance: '200000.0000',
  monthlyTopUpLimit: '100000.0000',
  addedThisMonth: '40000.0000',
  remainingThisMonth: '60000.0000',
  minTopUp: '10.0000',
  maxTopUp: '50000.0000',
};

describe('toScaled', () => {
  it('reads whole and fractional rupees exactly', () => {
    expect(toScaled('500', 2)).toBe(5_000_000);
    expect(toScaled('10.10', 2)).toBe(101_000);
    expect(toScaled('99999.99', 2)).toBe(999_999_900);
    expect(toScaled('0.05', 2)).toBe(500);
    expect(toScaled('10.', 2)).toBe(100_000);
    expect(toScaled('.5', 2)).toBe(5_000);
  });

  it('refuses anything that is not a plain non-negative decimal', () => {
    for (const bad of ['', '.', '-5', '+5', '1e3', 'abc', '1,000', '1.2.3', '12 3']) {
      expect(toScaled(bad, 2)).toBeNull();
    }
  });

  it('refuses more decimals than allowed', () => {
    expect(toScaled('1.234', 2)).toBeNull();
    expect(toScaled('1.234', 4)).toBe(12_340);
  });

  it('refuses more than nine whole digits', () => {
    expect(toScaled('999999999', 2)).toBe(9_999_999_990_000);
    expect(toScaled('1000000000', 2)).toBeNull();
  });
});

describe('toScaled with numbers', () => {
  it('accepts a JSON number', () => {
    expect(toScaled(1078.5, 4)).toBe(10_785_000);
    expect(toScaled(200000, 4)).toBe(2_000_000_000);
  });
});

describe('scaledToAmount', () => {
  it('always gives two decimals', () => {
    expect(scaledToAmount(5_000_000)).toBe('500.00');
    expect(scaledToAmount(101_000)).toBe('10.10');
    expect(scaledToAmount(999_999_900)).toBe('99999.99');
  });
});

describe('checkTopUp format', () => {
  it('says nothing for an empty field and disables', () => {
    expect(checkTopUp('', LIMITS)).toEqual({ ok: false, amount: null, message: null });
    expect(checkTopUp('   ', LIMITS).message).toBeNull();
  });

  it('accepts paise and normalises what is sent', () => {
    expect(checkTopUp('10.10', LIMITS)).toEqual({ ok: true, amount: '10.10', message: null });
    const roomy = { ...LIMITS, maxTopUp: '100000.0000', remainingThisMonth: '100000.0000' };
    expect(checkTopUp('99999.99', roomy).amount).toBe('99999.99');
    expect(checkTopUp('500', LIMITS).amount).toBe('500.00');
    expect(checkTopUp('500.5', LIMITS).amount).toBe('500.50');
    expect(checkTopUp(' 500 ', LIMITS).amount).toBe('500.00');
  });

  it('rejects zero, negative, three decimals and junk with a reason', () => {
    expect(checkTopUp('0', LIMITS)).toMatchObject({ ok: false, amount: null });
    expect(checkTopUp('0.00', LIMITS).message).toMatch(/above/);
    expect(checkTopUp('-5', LIMITS).ok).toBe(false);
    expect(checkTopUp('10.123', LIMITS).message).toMatch(/2 decimal/);
    expect(checkTopUp('abc', LIMITS).message).toMatch(/Enter an amount/);
  });

  it('rejects huge numbers without overflowing', () => {
    const huge = checkTopUp('99999999999999999999', LIMITS);
    expect(huge.ok).toBe(false);
    expect(huge.message).toMatch(/too large/);
    expect(checkTopUp('1000000000', null).ok).toBe(false);
  });

  it('with no limits (older API) checks the format only', () => {
    expect(checkTopUp('1', undefined)).toMatchObject({ ok: true, amount: '1.00' });
    expect(checkTopUp('5000000', null).ok).toBe(true);
  });
});

describe('checkTopUp against limits', () => {
  it('accepts exactly the minimum and the maximum', () => {
    expect(checkTopUp('10', LIMITS).ok).toBe(true);
    expect(checkTopUp('50000', LIMITS).ok).toBe(true);
  });

  it('refuses below the minimum, by a paisa', () => {
    const r = checkTopUp('9.99', LIMITS);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/smallest.*₹10/);
  });

  it('refuses above the per-top-up maximum, by a paisa', () => {
    const r = checkTopUp('50000.01', LIMITS);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/most you can add at a time/);
  });

  it('refuses more than the month has left and says how much is left', () => {
    const tight = { ...LIMITS, remainingThisMonth: '1000.0000' };
    expect(checkTopUp('1000', tight).ok).toBe(true);
    const r = checkTopUp('1000.01', tight);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/₹1,000 more this month/);
  });

  it('explains when the month is used up', () => {
    const none = { ...LIMITS, remainingThisMonth: '0.0000', minTopUp: '0.0000' };
    expect(checkTopUp('10', none).message).toMatch(/reached this month/);
  });

  it('refuses what would take the wallet past its maximum balance', () => {
    expect(checkTopUp('1000', LIMITS, '199000.00').ok).toBe(true);
    const r = checkTopUp('1000.01', LIMITS, '199000.00');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/hold up to ₹2,00,000/);
  });

  it('reads a balance that arrives as a JSON number', () => {
    expect(checkTopUp('1000', LIMITS, 199000).ok).toBe(true);
    expect(checkTopUp('1000.01', LIMITS, 199000).ok).toBe(false);
    expect(checkTopUp('10', LIMITS, 1078.5).ok).toBe(true);
  });

  it('skips the balance check when the balance is unknown', () => {
    expect(checkTopUp('50000', LIMITS, null).ok).toBe(true);
    expect(checkTopUp('50000', LIMITS, undefined).ok).toBe(true);
  });

  it('compares four-decimal server figures exactly', () => {
    const odd = { ...LIMITS, maxTopUp: '99.9999' };
    expect(checkTopUp('99.99', odd).ok).toBe(true);
    expect(checkTopUp('100', odd).ok).toBe(false);
  });
});

describe('addChip', () => {
  it('offers 500, 1000 and 5000', () => {
    expect([...TOP_UP_CHIPS]).toEqual([500, 1000, 5000]);
  });

  it('adds to what is typed', () => {
    expect(addChip('', 500)).toBe('500');
    expect(addChip('500', 1000)).toBe('1500');
    expect(addChip('10.10', 500)).toBe('510.10');
    expect(addChip('10.5', 500)).toBe('510.50');
  });

  it('treats unreadable text as nothing typed', () => {
    expect(addChip('abc', 500)).toBe('500');
    expect(addChip('1.234', 500)).toBe('500');
  });

  it('leaves the text alone rather than run past the digits the field takes', () => {
    expect(addChip('999999999', 500)).toBe('999999999');
    expect(addChip('999999500', 500)).toBe('999999500');
    expect(addChip('999999000', 500)).toBe('999999500');
  });
});
