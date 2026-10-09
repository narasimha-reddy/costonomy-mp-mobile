import {
  PAYOUT_EXPLANATION, PAID_EXPLANATION, payoutExplanation, payoutSourceLine, paymentSourceLabel,
} from '@/lib/credit/payouts';
import { paymentDetail, paymentTitle } from '@/lib/credit/payments';
import { paymentBadge } from '@/lib/credit/supplierLine';
import { destinationFor } from '@/lib/notifications/destination';
import type { CreditPayout } from '@/models/credit';
import type { AppNotification } from '@/models/notification';

const payout = (o: Partial<CreditPayout> = {}): CreditPayout => ({
  payoutId: 1, repaymentId: 1, agreementId: 1, outletId: 2, outletName: 'HSR', restaurantName: 'Spice Co',
  grossAmount: '1000.0000', commissionRatePercent: '2.5000', commissionAmount: '25.0000', netAmount: '975.0000',
  status: 'PENDING', settlementId: null, settlementNumber: null, settlementDate: null, appliedAt: null,
  createdAt: '2026-10-01T05:00:00Z', invoices: [], source: 'WALLET', paymentMethod: null, ...o,
});

const note = (o: Partial<AppNotification>): AppNotification => ({
  id: 1, category: 'CREDIT', eventType: 'X', title: 't', body: null, targetType: null, audience: null,
  targetId: 7, critical: false, read: false, createdAt: '2026-01-01T00:00:00Z', ...o,
});

describe('online payments in the supplier labels', () => {
  it('names the source "Paid through Mandi"', () => {
    expect(paymentSourceLabel('ONLINE')).toBe('Paid through Mandi');
    expect(paymentBadge('ONLINE')).toBe('Paid through Mandi');
  });
  it('keeps the wallet and other labels as they were', () => {
    expect(paymentSourceLabel('WALLET')).toBe('Mandi wallet');
    expect(paymentBadge('WALLET')).toBe('Through Mandi');
  });
});

describe('payout source line and explanation', () => {
  it('shows "Paid through Mandi · UPI" for an online payout', () => {
    expect(payoutSourceLine(payout({ source: 'ONLINE', paymentMethod: 'UPI' }))).toBe('Paid through Mandi · UPI');
    expect(payoutSourceLine(payout({ source: 'ONLINE', paymentMethod: 'CARD' }))).toBe('Paid through Mandi · Card');
  });
  it('drops the method when there is none, and shows nothing for a wallet payout', () => {
    expect(payoutSourceLine(payout({ source: 'ONLINE', paymentMethod: null }))).toBe('Paid through Mandi');
    expect(payoutSourceLine(payout({ source: 'WALLET' }))).toBeNull();
  });
  it('explains an online payout, by method', () => {
    expect(payoutExplanation(payout({ source: 'ONLINE', paymentMethod: 'UPI' }), false))
      .toBe('Paid through Mandi by UPI. We pay it to you in your next settlement.');
    expect(payoutExplanation(payout({ source: 'ONLINE', paymentMethod: 'CARD' }), false))
      .toBe('Paid through Mandi by card. We pay it to you in your next settlement.');
    expect(payoutExplanation(payout({ source: 'ONLINE', paymentMethod: null }), false))
      .toBe('Paid through Mandi. We pay it to you in your next settlement.');
  });
  it('says it was paid out once it is', () => {
    expect(payoutExplanation(payout({ source: 'ONLINE', paymentMethod: 'UPI' }), true))
      .toBe('Paid through Mandi by UPI. We paid it to you in a settlement.');
  });
  it('keeps the wallet wording, and treats a missing source as wallet (older server)', () => {
    expect(payoutExplanation(payout({ source: 'WALLET' }), false)).toBe(PAYOUT_EXPLANATION);
    expect(payoutExplanation(payout({ source: 'WALLET' }), true)).toBe(PAID_EXPLANATION);
    expect(payoutExplanation({ ...payout(), source: undefined } as unknown as CreditPayout, false)).toBe(PAYOUT_EXPLANATION);
  });
});

describe('restaurant payment rows', () => {
  it('titles an online payment "Paid online"', () => {
    expect(paymentTitle('ONLINE', 'Acme')).toBe('Paid online');
    expect(paymentTitle('WALLET', 'Acme')).toBe('From wallet');
  });
  it('shows only the method for an online payment, never the Razorpay id', () => {
    expect(paymentDetail('UPI', 'pay_Abc123', 'ONLINE')).toBe('UPI');
    expect(paymentDetail('CARD', 'pay_Abc123', 'ONLINE')).toBe('Card');
    expect(paymentDetail(null, 'pay_Abc123', 'ONLINE')).toBeNull();
    expect(paymentDetail('UPI', 'UTR9', 'SUPPLIER_RECORDED')).toBe('UPI · ref UTR9');
  });
});

describe('notification destination', () => {
  it('opens the pay result for a restaurant and nothing for a supplier', () => {
    expect(destinationFor(note({ targetType: 'CREDIT_PAYMENT_ATTEMPT', audience: 'OUTLET' })))
      .toBe('/restaurant/credit/pay/7');
    expect(destinationFor(note({ targetType: 'CREDIT_PAYMENT_ATTEMPT', audience: 'SUPPLIER_STORE' }))).toBeNull();
  });
});
