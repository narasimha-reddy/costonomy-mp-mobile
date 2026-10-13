import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { transactionIdOf } from '@/lib/credit/transactionId';
import { TransactionIdLine } from '@/components/credit/TransactionIdLine';
import { SupplierPaymentRow } from '@/components/credit/SupplierPaymentRow';
import { CreditPaymentRow } from '@/components/credit/CreditPaymentRow';
import { PaymentRow } from '@/components/credit/PayoutRow';
import { statementDetail } from '@/lib/credit/statement';
import { paymentDetail } from '@/lib/credit/payments';

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});

describe('transactionIdOf', () => {
  it('is the Razorpay payment id for a UPI or Card payment', () => {
    expect(transactionIdOf({ source: 'ONLINE', reference: 'pay_Tm84edcg6g8q5l' })).toBe('pay_Tm84edcg6g8q5l');
  });
  it('is the wallet ledger entry id for a wallet payment', () => {
    expect(transactionIdOf({ source: 'WALLET', reference: 'credit-repayment-35', walletEntryId: 1842 })).toBe('1842');
  });
  it('falls back to the wallet reference when the API sends no entry id (supplier side)', () => {
    expect(transactionIdOf({ source: 'WALLET', reference: 'credit-repayment-35', walletEntryId: null })).toBe('credit-repayment-35');
  });
  it('is null for payments recorded by hand: their reference stays "ref ..."', () => {
    expect(transactionIdOf({ source: 'SUPPLIER_RECORDED', reference: 'UTR1' })).toBeNull();
    expect(transactionIdOf({ source: 'CLAIM_CONFIRMED', reference: 'UTR1' })).toBeNull();
  });
  it('is null when there is nothing to show', () => {
    expect(transactionIdOf({ source: 'ONLINE', reference: '  ' })).toBeNull();
    expect(transactionIdOf({ source: 'WALLET', reference: null, walletEntryId: null })).toBeNull();
  });
});

describe('TransactionIdLine', () => {
  it('labels the id and makes it selectable', () => {
    render(<TransactionIdLine id="pay_abc123" testID="tx" />);
    expect(screen.getByText('Transaction ID')).toBeTruthy();
    const value = screen.getByTestId('tx-value');
    expect(value).toHaveTextContent('pay_abc123');
    expect(value.props.selectable).toBe(true);
  });
  it('renders nothing without an id', () => {
    render(<TransactionIdLine id={null} testID="tx" />);
    expect(screen.queryByText('Transaction ID')).toBeNull();
  });
});

const store = (o: Record<string, unknown>) => ({
  id: 9, paidAt: '2026-10-06T06:00:00Z', paidOn: '2026-10-06', agreementId: 3, outletId: 7, outletName: 'O',
  restaurantName: 'R', invoiceId: 1, invoiceNumber: 'INV-1', amount: '500.0000', source: 'ONLINE', method: 'CARD',
  reference: 'pay_abc123', ...o,
}) as never;

describe('supplier Recent payments row', () => {
  it('shows the Transaction ID of an online payment', () => {
    render(<SupplierPaymentRow payment={store({})} />);
    expect(screen.getByTestId('agreement-payment-9-txid-value')).toHaveTextContent('pay_abc123');
    expect(screen.getByText('Card')).toBeTruthy();
  });
  it('shows the wallet reference for a wallet payment', () => {
    render(<SupplierPaymentRow payment={store({ source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-35' })} />);
    expect(screen.getByTestId('agreement-payment-9-txid-value')).toHaveTextContent('credit-repayment-35');
  });
  it('keeps the old "ref" wording and no Transaction ID for a payment recorded in the past', () => {
    render(<SupplierPaymentRow payment={store({ source: 'SUPPLIER_RECORDED', method: 'UPI', reference: 'UTR9' })} />);
    expect(screen.getByText('UPI · ref UTR9')).toBeTruthy();
    expect(screen.queryByText('Transaction ID')).toBeNull();
  });
});

describe('restaurant invoice payment row', () => {
  const inv = (o: Record<string, unknown>) => ({
    id: 4, amount: '500.0000', source: 'ONLINE', method: 'UPI', reference: 'pay_up1', paidAt: '2026-10-06T06:00:00Z',
    walletEntryId: null, ...o,
  }) as never;
  it('shows the Razorpay id for UPI', () => {
    render(<CreditPaymentRow payment={inv({})} supplierName="Sri Balaji" />);
    expect(screen.getByTestId('payment-4-txid-value')).toHaveTextContent('pay_up1');
  });
  it('shows the wallet entry id for a wallet payment, and the row still opens the wallet transaction', () => {
    const open = jest.fn();
    render(<CreditPaymentRow payment={inv({ source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-3', walletEntryId: 77 })}
      supplierName="Sri Balaji" onOpenWallet={open} />);
    expect(screen.getByTestId('payment-4-txid-value')).toHaveTextContent('77');
  });
});

describe('payouts screen payment row (recorded list)', () => {
  it('shows the Transaction ID for an online payment', () => {
    render(<PaymentRow payment={store({})} />);
    expect(screen.getByTestId('payment-row-9-txid-value')).toHaveTextContent('pay_abc123');
  });
});

describe('statement and shared detail text', () => {
  it('says Transaction ID for an online repayment and for a wallet one', () => {
    const line = (o: Record<string, unknown>) => ({
      at: '2026-10-06T06:00:00Z', type: 'REPAYMENT', label: 'Repayment', amount: '500', owedAfter: '0',
      invoiceNumber: 'INV-1', source: 'ONLINE', method: 'CARD', reference: 'pay_abc', walletEntryId: null, ...o,
    }) as never;
    expect(statementDetail(line({}))).toBe('INV-1 · Repayment · Card · Transaction ID pay_abc');
    expect(statementDetail(line({ source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-3', walletEntryId: 77 })))
      .toBe('INV-1 · Repayment · From wallet · Transaction ID 77');
  });
  it('paymentDetail still hides the id (the row shows it on its own line)', () => {
    expect(paymentDetail('CARD', 'pay_x', 'ONLINE')).toBe('Card');
  });
});
