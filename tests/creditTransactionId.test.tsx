import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { transactionIdOf } from '@/lib/credit/transactionId';
import { TransactionIdLine } from '@/components/credit/TransactionIdLine';
import { SupplierPaymentRow } from '@/components/credit/SupplierPaymentRow';
import { CreditPaymentRow } from '@/components/credit/CreditPaymentRow';
import { PaymentRow, PayoutRow } from '@/components/credit/PayoutRow';
import { PayoutSheet } from '@/components/credit/PayoutSheet';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';
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
  it('uses the API transactionId first (supplier side): the same number the restaurant sees', () => {
    expect(transactionIdOf({ source: 'WALLET', reference: 'credit-repayment-35', walletEntryId: null, transactionId: '1842' })).toBe('1842');
    expect(transactionIdOf({ source: 'ONLINE', reference: 'pay_x', transactionId: 'pay_x' })).toBe('pay_x');
  });
  it('never shows the internal credit-repayment-N reference as an id (older server)', () => {
    expect(transactionIdOf({ source: 'WALLET', reference: 'credit-repayment-35', walletEntryId: null })).toBeNull();
  });
  it('ignores a transactionId on a payment recorded by hand', () => {
    expect(transactionIdOf({ source: 'SUPPLIER_RECORDED', reference: 'UTR1', transactionId: '5' })).toBeNull();
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
  it('shows the shared transaction id for a wallet-funded payment, with no wallet or credit-repayment text', () => {
    render(<SupplierPaymentRow payment={store({ source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-35', transactionId: '1842' })} />);
    expect(screen.getByTestId('agreement-payment-9-txid-value')).toHaveTextContent('1842');
    expect(screen.getByText('Through Mandi')).toBeTruthy();
    expect(screen.queryByText(/wallet|credit-repayment/i)).toBeNull();
  });
  it('shows no id (not the internal reference) when an older server sends none', () => {
    render(<SupplierPaymentRow payment={store({ source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-35' })} />);
    expect(screen.queryByText('Transaction ID')).toBeNull();
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

describe('payout card and sheet', () => {
  const payout = (o: Record<string, unknown>) => ({
    payoutId: 5, repaymentId: 30, agreementId: 3, outletId: 7, outletName: 'Indiranagar', restaurantName: 'Spice Garden',
    grossAmount: '500.0000', commissionRatePercent: null, commissionAmount: '0.0000', netAmount: '500.0000',
    status: 'PENDING', settlementId: null, settlementNumber: null, settlementDate: null, appliedAt: null,
    createdAt: '2026-10-06T06:00:00Z', invoices: [], source: 'ONLINE', paymentMethod: 'CARD', ...o,
  }) as never;
  it('card shows the Razorpay id of an online payout as selectable text', () => {
    render(<PayoutRow payout={payout({ transactionId: 'pay_abc123' })} onPress={jest.fn()} />);
    const v = screen.getByTestId('payout-row-5-txid-value');
    expect(v).toHaveTextContent('pay_abc123');
    expect(v.props.selectable).toBe(true);
  });
  it('card shows the shared id of a wallet-funded payout and only says Paid through Mandi', () => {
    render(<PayoutRow payout={payout({ source: 'WALLET', paymentMethod: null, transactionId: '1842' })} onPress={jest.fn()} />);
    expect(screen.getByTestId('payout-row-5-txid-value')).toHaveTextContent('1842');
    expect(screen.getByTestId('payout-source-5')).toHaveTextContent('Paid through Mandi');
    expect(screen.queryByText(/wallet/i)).toBeNull();
  });
  it('card has no Transaction ID line when the server sends none', () => {
    render(<PayoutRow payout={payout({})} onPress={jest.fn()} />);
    expect(screen.queryByText('Transaction ID')).toBeNull();
  });
  it('sheet shows the id and says nothing about a wallet', () => {
    render(<PayoutSheet payout={payout({ source: 'WALLET', paymentMethod: null, transactionId: '1842' })} visible onClose={jest.fn()} onCopy={jest.fn()} />);
    expect(screen.getByTestId('sheet-txid-value')).toHaveTextContent('1842');
    expect(screen.getByTestId('sheet-txid-value').props.selectable).toBe(true);
    expect(screen.queryByText(/wallet/i)).toBeNull();
  });
});

describe('payouts screen payment row (recorded list)', () => {
  it('shows the Transaction ID for an online payment', () => {
    render(<PaymentRow payment={store({})} />);
    expect(screen.getByTestId('payment-row-9-txid-value')).toHaveTextContent('pay_abc123');
  });
  it('shows the shared id for a wallet-funded payment and never the word wallet', () => {
    render(<PaymentRow payment={store({ source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-3', transactionId: '1842' })} />);
    expect(screen.getByTestId('payment-row-9-txid-value')).toHaveTextContent('1842');
    expect(screen.queryByText(/wallet|credit-repayment/i)).toBeNull();
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
  it('the supplier statement says Paid through Mandi, not From wallet, and keeps the id', () => {
    const l = { at: '2026-10-06T06:00:00Z', type: 'REPAYMENT', label: 'Repayment', amount: '500', owedAfter: '0',
      invoiceNumber: 'INV-1', source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-3', walletEntryId: 77 } as never;
    expect(statementDetail(l, 'supplier')).toBe('INV-1 · Repayment · Paid through Mandi · Transaction ID 77');
  });
  it('paymentDetail still hides the id (the row shows it on its own line)', () => {
    expect(paymentDetail('CARD', 'pay_x', 'ONLINE')).toBe('Card');
  });
});

describe('supplier open-invoice row order label', () => {
  const inv = (o: Record<string, unknown>) => ({
    id: 11, invoiceNumber: 'INV-11', creditAgreementId: 3, supplierOrderId: 104, status: 'OPEN', amount: '500.0000',
    paidAmount: '0.0000', outstanding: '500.0000', dueDate: '2026-11-01', overdueAfter: '2026-11-04', issuedAt: '2026-10-06T06:00:00Z',
    settledAt: null, dueState: 'NOT_DUE', daysToDue: 18, reportableAmount: '500.0000', creditedAmount: '0.0000', ...o,
  }) as never;
  it('shows the order number the invoice detail shows', () => {
    render(<CreditInvoiceRow invoice={inv({ orderNumber: 'MP-261007-000024' })} />);
    expect(screen.getByText('Order #MP-261007-000024')).toBeTruthy();
    expect(screen.queryByText('Order #104')).toBeNull();
  });
  it('falls back to the order id when the server sends no order number', () => {
    render(<CreditInvoiceRow invoice={inv({})} />);
    expect(screen.getByText('Order #104')).toBeTruthy();
  });
});
