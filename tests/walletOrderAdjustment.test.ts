import { accountLine, entryLabel, rowLabel, rowTitle } from '@/lib/wallet/entryCopy';
import type { WalletEntry } from '@/models/wallet';
import { ORDER_ADJUSTMENT_CREDIT, ORDER_ADJUSTMENT_DEBIT } from './fixtures/catchWeightContract';

const entry = (raw: object) => raw as unknown as WalletEntry;

describe('wallet copy for ORDER_ADJUSTMENT (the API words it, the app matches)', () => {
  it('a credit is money back, a debit an extra charge', () => {
    expect(entryLabel(entry(ORDER_ADJUSTMENT_CREDIT))).toBe('Order adjusted · money back');
    expect(entryLabel(entry(ORDER_ADJUSTMENT_DEBIT))).toBe('Order adjusted · extra charge');
  });

  it('the History row says who it came from or went to, and names the order', () => {
    expect(rowLabel(entry(ORDER_ADJUSTMENT_CREDIT))).toBe('Refund from');
    expect(rowLabel(entry(ORDER_ADJUSTMENT_DEBIT))).toBe('Paid to');
    expect(rowTitle(entry(ORDER_ADJUSTMENT_CREDIT))).toBe('Order #501');
    expect(accountLine(entry(ORDER_ADJUSTMENT_CREDIT))).toBe('Credited to wallet');
  });

  it('is not the generic fallback any more', () => {
    expect(entryLabel(entry(ORDER_ADJUSTMENT_CREDIT))).not.toBe('Money in');
  });
});

describe('the two bank-payout kinds the API has and the app lacked', () => {
  it('are worded as the API words them', () => {
    expect(entryLabel(entry({ ...ORDER_ADJUSTMENT_CREDIT, kind: 'BANK_PAYOUT', direction: 'DEBIT' })))
      .toBe('Transferred to verified bank account');
    expect(entryLabel(entry({ ...ORDER_ADJUSTMENT_CREDIT, kind: 'BANK_PAYOUT_REVERSAL' })))
      .toBe('Bank transfer returned to wallet');
  });
});
