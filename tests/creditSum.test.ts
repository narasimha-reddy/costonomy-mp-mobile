import { sumAmounts } from '@/lib/credit/sum';

describe('sumAmounts', () => {
  it('adds as integers: 0.1 + 0.2 is 0.30', () => {
    expect(sumAmounts(['0.1', '0.2'])).toBe('0.30');
    expect(sumAmounts([0.1, 0.2])).toBe('0.30');
  });

  it('adds server decimals with four places', () => {
    expect(sumAmounts(['7200.0000', '5500.0000'])).toBe('12700.00');
    expect(sumAmounts(['1234.5600', '0.0100', '99999.9900'])).toBe('101234.56');
  });

  it('is 0.00 for nothing and null for an unreadable amount', () => {
    expect(sumAmounts([])).toBe('0.00');
    expect(sumAmounts(['12', 'abc'])).toBeNull();
    expect(sumAmounts(['-5'])).toBeNull();
  });

  it('does not drift over many small amounts', () => {
    expect(sumAmounts(Array.from({ length: 10 }, () => '0.1'))).toBe('1.00');
    expect(sumAmounts(Array.from({ length: 100 }, () => '19.99'))).toBe('1999.00');
  });
});
