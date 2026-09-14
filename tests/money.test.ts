import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';

describe('formatMoney', () => {
  it('formats with Indian digit grouping', () => {
    // Not 1,450,000.00 — Indian grouping is 2,2,3 after the first three digits.
    expect(formatMoney('1450000')).toBe('₹14,50,000.00');
  });

  it('always shows paise by default', () => {
    expect(formatMoney('410')).toBe('₹410.00');
  });

  it('drops paise on whole rupees only when compact', () => {
    expect(formatMoney('410', true)).toBe('₹410');
    expect(formatMoney('410.50', true)).toBe('₹410.50');
  });

  it('accepts the decimal strings the API sends for DECIMAL(19,4) columns', () => {
    expect(formatMoney('1450.0000')).toBe('₹1,450.00');
  });

  it('renders a dash rather than NaN or ₹0 for a missing amount', () => {
    // ₹0.00 would be a lie about a value the server did not send.
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney('not-a-number')).toBe('—');
  });
});

describe('formatQuantity', () => {
  it('trims the trailing zeros of a DECIMAL(19,4) quantity', () => {
    expect(formatQuantity(20, 'KG')).toBe('20 KG');
  });

  it('keeps genuine fractional quantities', () => {
    expect(formatQuantity(2.5, 'L')).toBe('2.5 L');
  });

  it('omits the unit when there is none', () => {
    expect(formatQuantity(6)).toBe('6');
  });

  it('renders a dash for a missing quantity', () => {
    expect(formatQuantity(null, 'KG')).toBe('—');
  });
});

describe('formatGstRate', () => {
  it('formats whole and fractional rates', () => {
    expect(formatGstRate(5)).toBe('5%');
    expect(formatGstRate(12.5)).toBe('12.5%');
  });

  it('renders a dash for a missing rate', () => {
    expect(formatGstRate(null)).toBe('—');
  });
});
