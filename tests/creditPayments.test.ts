import { methodLabel, paymentDetail, paymentTitle } from '@/lib/credit/payments';

describe('credit payment copy', () => {
  it('names the known methods', () => {
    expect(methodLabel('BANK_TRANSFER')).toBe('Bank transfer');
    expect(methodLabel('UPI')).toBe('UPI');
    expect(methodLabel('CASH')).toBe('Cash');
    expect(methodLabel('CHEQUE')).toBe('Cheque');
    expect(methodLabel('CARD')).toBe('Card');
    expect(methodLabel('ADJUSTMENT')).toBe('Adjustment');
  });
  it('shows an unknown method as sent and nothing for none', () => {
    expect(methodLabel('NEFT_X')).toBe('NEFT_X');
    expect(methodLabel(null)).toBeNull();
    expect(methodLabel('  ')).toBeNull();
  });
  it('words the title by source', () => {
    expect(paymentTitle('WALLET', 'Acme')).toBe('From wallet');
    expect(paymentTitle('SUPPLIER_RECORDED', 'Acme')).toBe('Recorded by Acme');
    expect(paymentTitle('CLAIM_CONFIRMED', 'Acme')).toBe('You reported this · confirmed by Acme');
  });
  it('joins method and reference', () => {
    expect(paymentDetail('UPI', 'R1')).toBe('UPI · ref R1');
    expect(paymentDetail('UPI', null)).toBe('UPI');
    expect(paymentDetail(null, 'R1')).toBe('ref R1');
    expect(paymentDetail(null, null)).toBeNull();
  });
});
