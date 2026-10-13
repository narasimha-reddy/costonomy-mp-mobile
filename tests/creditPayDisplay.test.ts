import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { PayoutRow, PaymentRow } from '@/components/credit/PayoutRow';
import { PayoutSheet } from '@/components/credit/PayoutSheet';
import { methodLabel, paymentDetail, paymentTitle } from '@/lib/credit/payments';
import { PAYOUT_EXPLANATION, paymentSourceLabel } from '@/lib/credit/payouts';
import { paymentBadge } from '@/lib/credit/supplierLine';
import { destinationFor } from '@/lib/notifications/destination';
import type { CreditPayout, StorePayment } from '@/models/credit';
import type { AppNotification } from '@/models/notification';
import { renderedText } from './fixtures/renderedText';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  const Icon = ({ name }: { name: string }) => R.createElement(Text, null, `icon:${name}`);
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));

afterEach(cleanup);

/** The new source and method fields are not on the model until WP-E lands; the casts are the contract. */
const payout = (o: Record<string, unknown> = {}) => ({
  payoutId: 1, repaymentId: 101, agreementId: 3, outletId: 7, outletName: 'Indiranagar', restaurantName: 'Spice Co',
  grossAmount: '5000.0000', commissionRatePercent: '2.0000', commissionAmount: '100.0000', netAmount: '4900.0000',
  status: 'PENDING', settlementId: null, settlementNumber: null, settlementDate: null, appliedAt: null,
  createdAt: '2026-10-01T06:30:00Z', invoices: [{ invoiceId: 11, invoiceNumber: 'INV-11', amount: '5000.0000' }],
  source: 'ONLINE', paymentMethod: 'UPI', ...o,
}) as unknown as CreditPayout;

const storePayment = (o: Record<string, unknown> = {}) => ({
  id: 5, paidAt: '2026-09-28T06:30:00Z', paidOn: '2026-09-28', agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', invoiceId: 41, invoiceNumber: 'INV-41', amount: '2500.0000',
  source: 'ONLINE', method: 'UPI', reference: 'pay_RazorpayInternal123', ...o,
}) as unknown as StorePayment;

const note = (o: Partial<AppNotification>): AppNotification => ({
  id: 1, category: 'CREDIT', eventType: 'X', title: 't', body: null, targetType: null, audience: null, targetId: 7,
  critical: false, read: false, createdAt: '2026-01-01T00:00:00Z', ...o,
});

describe('payout wording', () => {
  it('names an online payment "Paid through Mandi"', () => {
    expect(paymentSourceLabel('ONLINE' as never)).toBe('Paid through Mandi');
  });

  it('keeps the wallet wording unchanged', () => {
    expect(paymentSourceLabel('WALLET')).toBe('Mandi wallet');
  });

  it('a pending online payout explains itself by method, not as a wallet payment', () => {
    render(React.createElement(PayoutSheet, { payout: payout(), visible: true, onClose: jest.fn(), onCopy: jest.fn() }));
    const t = renderedText(screen.toJSON() as never);
    expect(t).toContain('Paid through Mandi by UPI. We pay it to you in your next settlement.');
    expect(t).not.toContain(PAYOUT_EXPLANATION);
    expect(t).not.toMatch(/Mandi wallet/);
  });

  it('a card payout says "by card"', () => {
    render(React.createElement(PayoutSheet, { payout: payout({ paymentMethod: 'CARD' }), visible: true, onClose: jest.fn(), onCopy: jest.fn() }));
    expect(renderedText(screen.toJSON() as never)).toContain('Paid through Mandi by card. We pay it to you in your next settlement.');
  });

  it('a wallet payout keeps the wallet explanation', () => {
    render(React.createElement(PayoutSheet, {
      payout: payout({ source: 'WALLET', paymentMethod: null }), visible: true, onClose: jest.fn(), onCopy: jest.fn(),
    }));
    const t = renderedText(screen.toJSON() as never);
    expect(t).toContain(PAYOUT_EXPLANATION);
    expect(t).not.toContain('Paid through Mandi by');
  });

  it('the sheet shows "Paid through Mandi · UPI" for an online payout', () => {
    render(React.createElement(PayoutSheet, { payout: payout(), visible: true, onClose: jest.fn(), onCopy: jest.fn() }));
    expect(renderedText(screen.toJSON() as never)).toContain('Paid through Mandi · UPI');
  });

  it('the row shows "Paid through Mandi · UPI" for an online payout', () => {
    render(React.createElement(PayoutRow, { payout: payout(), onPress: jest.fn() }));
    expect(renderedText(screen.toJSON() as never)).toContain('Paid through Mandi · UPI');
  });

  it('a wallet payout row shows no "Paid through Mandi" label', () => {
    render(React.createElement(PayoutRow, { payout: payout({ source: 'WALLET', paymentMethod: null }), onPress: jest.fn() }));
    expect(renderedText(screen.toJSON() as never)).not.toContain('Paid through Mandi');
  });

  it('the figures on an online payout are still the server\'s three', () => {
    render(React.createElement(PayoutRow, { payout: payout(), onPress: jest.fn() }));
    const t = renderedText(screen.toJSON() as never);
    expect(t).toContain('₹5,000.00');
    expect(t).toContain('₹100.00');
    expect(t).toContain('₹4,900.00');
  });
});

describe('restaurant payment rows', () => {
  it('title: "Paid online"', () => {
    expect(paymentTitle('ONLINE', 'Acme')).toBe('Paid online');
  });

  it('detail is the method alone, never the Razorpay id', () => {
    expect(paymentDetail('UPI', 'pay_RazorpayInternal123', 'ONLINE')).toBe('UPI');
    expect(paymentDetail('CARD', 'pay_RazorpayInternal123', 'ONLINE')).toBe('Card');
    expect(paymentDetail(null, 'pay_RazorpayInternal123', 'ONLINE')).toBeNull();
  });

  it('other sources are unchanged', () => {
    expect(paymentTitle('WALLET', 'Acme')).toBe('From wallet');
    expect(paymentTitle('SUPPLIER_RECORDED', 'Acme')).toBe('Recorded by Acme');
    expect(paymentDetail('UPI', 'UTR1', 'SUPPLIER_RECORDED')).toBe('UPI · ref UTR1');
    expect(paymentDetail('WALLET', 'credit-repayment-13', 'WALLET')).toBeNull();
    expect(methodLabel('CARD')).toBe('Card');
  });
});

describe('supplier\'s payments', () => {
  it('an online payment shows its source, method and Transaction ID (the Razorpay payment id)', () => {
    render(React.createElement(PaymentRow, { payment: storePayment() }));
    const t = renderedText(screen.toJSON() as never);
    expect(t).toContain('Paid through Mandi');
    expect(t).toContain('Transaction ID');
    expect(t).toContain('pay_RazorpayInternal123');
  });

  it('the badge on an online payment is "Paid through Mandi"', () => {
    expect(paymentBadge('ONLINE')).toBe('Paid through Mandi');
  });

  it('other badges are unchanged', () => {
    expect(paymentBadge('WALLET')).toBe('Through Mandi');
    expect(paymentBadge('SUPPLIER_RECORDED')).toBe('You recorded');
    expect(paymentBadge('SOMETHING_NEW')).toBeNull();
  });
});

describe('notification destination', () => {
  it('a restaurant is taken to the payment\'s result screen', () => {
    expect(destinationFor(note({ targetType: 'CREDIT_PAYMENT_ATTEMPT', audience: 'OUTLET', targetId: 9 })))
      .toBe('/restaurant/credit/pay/9');
  });

  it('a supplier has no such screen', () => {
    expect(destinationFor(note({ targetType: 'CREDIT_PAYMENT_ATTEMPT', audience: 'SUPPLIER_STORE', targetId: 9 }))).toBeNull();
  });

  it('with no target id it goes nowhere', () => {
    expect(destinationFor(note({ targetType: 'CREDIT_PAYMENT_ATTEMPT', audience: 'OUTLET', targetId: null }))).toBeNull();
  });
});
