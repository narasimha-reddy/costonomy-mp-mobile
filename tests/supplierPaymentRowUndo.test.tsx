import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SupplierPaymentRow } from '@/components/credit/SupplierPaymentRow';
import type { StorePayment } from '@/models/credit';

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});

const payment = (over: Partial<StorePayment> = {}): StorePayment => ({
  id: 31, paidAt: '2026-10-02T06:00:00Z', paidOn: '2026-10-02', agreementId: 3, outletId: 7, outletName: 'X',
  restaurantName: 'Spice Co', invoiceId: 51, invoiceNumber: 'INV-51', amount: '1500.0000',
  source: 'SUPPLIER_RECORDED', method: 'UPI', reference: 'UTR1', receiptId: 9, reversible: true,
  reversibleUntil: '2026-10-12', reversedAt: null, ...over,
});

afterEach(cleanup);

describe('SupplierPaymentRow undo', () => {
  it('shows Undo with the last day when reversible and the caller may undo', () => {
    const onUndo = jest.fn();
    render(<SupplierPaymentRow payment={payment()} onUndo={onUndo} />);
    expect(screen.getByText('Undo until 12th Oct')).toBeTruthy();
    fireEvent.press(screen.getByTestId('undo-payment-31'));
    expect(onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 31 }));
  });

  it('has no Undo when the server says it is not reversible', () => {
    render(<SupplierPaymentRow payment={payment({ reversible: false })} onUndo={jest.fn()} />);
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
  });

  it('has no Undo when the field is missing (an older server)', () => {
    render(<SupplierPaymentRow payment={payment({ reversible: undefined })} onUndo={jest.fn()} />);
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
  });

  it('has no Undo without the permission (no handler passed)', () => {
    render(<SupplierPaymentRow payment={payment()} />);
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
  });

  it('has no Undo on a reversed payment, and marks it Cancelled with a struck, muted amount', () => {
    render(<SupplierPaymentRow
      payment={payment({ reversible: false, reversedAt: '2026-10-05T10:00:00Z', reversibleUntil: null })}
      onUndo={jest.fn()} />);
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
    expect(screen.getByTestId('payment-cancelled-31')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Cancelled on 5th Oct')).toBeTruthy();
    const amount = screen.getByTestId('payment-amount-31');
    expect(JSON.stringify(amount.props.style)).toContain('line-through');
  });

  it('does not strike an ordinary payment', () => {
    render(<SupplierPaymentRow payment={payment()} />);
    expect(screen.queryByTestId('payment-cancelled-31')).toBeNull();
    expect(JSON.stringify(screen.getByTestId('payment-amount-31').props.style ?? '')).not.toContain('line-through');
  });

  it('turns Undo off while offline', () => {
    const onUndo = jest.fn();
    render(<SupplierPaymentRow payment={payment()} onUndo={onUndo} undoDisabled />);
    fireEvent.press(screen.getByTestId('undo-payment-31'));
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('copes with a huge amount and a long invoice number', () => {
    render(<SupplierPaymentRow
      payment={payment({ amount: '99999999999.0000', invoiceNumber: 'INV-VERY-LONG-NUMBER-2026-0000001' })}
      onUndo={jest.fn()} />);
    expect(screen.getByTestId('undo-payment-31')).toBeTruthy();
  });
});
