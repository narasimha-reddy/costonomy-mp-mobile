import {
  barCountText, paidBody, paidByLabel, receiptFooter, refundBannerText, refundedBody, unavailableText,
} from '@/lib/credit/pay/copy';
import type { CreditPayAttempt } from '@/models/creditPay';

function attempt(over: Partial<CreditPayAttempt>): CreditPayAttempt {
  return {
    attemptId: 1, outletId: 1, status: 'PAID', method: 'UPI', paidWith: 'UPI', paymentDetail: null, invoiceCount: 2,
    amount: '100.00', feeAmount: '0', totalCharged: '100.00', currency: 'INR', razorpayOrderId: 'o', razorpayPaymentId: 'p',
    keyId: null, reopened: false, refundAmount: '40.00', refundState: 'PENDING', createdAt: '', paidAt: '2026-10-09T10:00:00Z',
    expiresAt: null, walletBalanceAfter: null, suppliers: [],
    invoices: [
      { invoiceId: 1, invoiceNumber: 'A', agreementId: 1, supplierStoreId: 1, supplierName: 'S', amount: '60', outcome: 'PAID', skipReason: null },
      { invoiceId: 2, invoiceNumber: 'B', agreementId: 1, supplierStoreId: 1, supplierName: 'S', amount: '40', outcome: 'SKIPPED', skipReason: 'AMOUNT_CHANGED' },
    ],
    ...over,
  };
}

describe('pay copy', () => {
  it('counts invoices', () => {
    expect(barCountText(1)).toBe('1 invoice');
    expect(barCountText(3)).toBe('3 invoices');
    expect(paidBody('12480', 3)).toBe('₹12,480.00 paid for 3 invoices.');
  });

  it('words the partial refund and its completion', () => {
    expect(refundBannerText(attempt({}))).toBe(
      "₹40.00 is going back to your UPI. 1 invoice changed before your payment arrived, so we didn't pay them twice.");
    expect(refundBannerText(attempt({ refundState: 'COMPLETED' }))).toBe('₹40.00 has been returned to your UPI.');
    expect(refundedBody(attempt({ paidWith: 'CARD' }))).toBe(
      'These invoices changed before your payment arrived, so nothing was paid. ₹40.00 is going back to your card.');
  });

  it('labels how it was paid and the footer in IST', () => {
    expect(paidByLabel(null, 'WALLET')).toBe('Wallet');
    expect(paidByLabel('NETBANKING', 'UPI')).toBe('Net banking');
    expect(receiptFooter(attempt({}))).toBe('Paid by UPI · 9th Oct, 3:30 pm');
  });

  it('words method unavailability', () => {
    expect(unavailableText('WALLET_SHORT', '3480')).toBe('Wallet is ₹3,480.00 short');
    expect(unavailableText('WALLET_ON_HOLD', null)).toBe('Your wallet is on hold. Please contact support.');
    expect(unavailableText('BELOW_MINIMUM', null)).toBe('Online payments start at ₹1. Pay this from your wallet.');
    expect(unavailableText(null, null)).toBeNull();
  });
});
