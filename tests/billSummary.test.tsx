import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BillSummary, billSummaryFor } from '@/components/order/BillSummary';
import type { SupplierOrder } from '@/models/procurement';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

// Deliberately inconsistent: no sum of the lines gives 1234.56, so only a server field can produce it.
const base = {
  status: 'PREPARING', paymentMethod: 'PREPAID', paymentStatus: 'CAPTURED',
  subtotal: '1000.10', gstAmount: '180.20', acceptedSubtotal: '900.00', acceptedGst: '162.00',
  totalAmount: '1234.56', acceptedAmount: null, deliveryFee: '49.00', deliveryMode: 'COSTONOMY_DELIVERY',
} as unknown as SupplierOrder;

function show(order: SupplierOrder, settled = false) {
  const p = billSummaryFor(order, settled);
  render(<BillSummary {...p} />);
}

describe('BillSummary', () => {
  it('bill lines equal server fields to the paisa', () => {
    show(base);
    expect(screen.getByText('₹1,000.10')).toBeTruthy();
    expect(screen.getByText('₹180.20')).toBeTruthy();
    expect(screen.getByText('₹49.00')).toBeTruthy();
    // The grand total is the server's, not the 1,229.30 the lines add up to.
    expect(screen.getAllByText('₹1,234.56').length).toBeGreaterThan(0);
    expect(screen.queryByText('₹1,229.30')).toBeNull();
  });

  it('uses the accepted figures once settled', () => {
    show({ ...base, status: 'COMPLETED', acceptedAmount: '1111.11' } as SupplierOrder, true);
    expect(screen.getByText('₹900.00')).toBeTruthy();
    expect(screen.getByText('₹162.00')).toBeTruthy();
    expect(screen.getAllByText('₹1,111.11').length).toBeGreaterThan(0);
  });

  it('no coupon line or savings strip without savings', () => {
    show(base);
    expect(screen.queryByText(/coupon/i)).toBeNull();
    expect(screen.queryByText(/you saved/i)).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
  });

  it('shows the savings strip only when savings are above zero', () => {
    render(<BillSummary lines={[]} grandTotal="10.00" finalLine={{ label: 'Total', amount: '10.00' }} savings="5.00" />);
    expect(screen.getByText('You saved ₹5.00')).toBeTruthy();
  });

  it('final line from paymentLine', () => {
    show({ ...base, paymentMethod: 'CREDIT', paymentStatus: 'ON_CREDIT', creditDueDate: '2026-10-12' } as SupplierOrder);
    expect(screen.getByText('Due 12th Oct 2026')).toBeTruthy();
    expect(screen.queryByText('Paid')).toBeNull();
  });

  it('PICKUP has no delivery fee line', () => {
    show({ ...base, deliveryMode: 'PICKUP', deliveryFee: '0.00' } as SupplierOrder);
    expect(screen.queryByText('Delivery partner fee')).toBeNull();
    expect(screen.queryByText('Free')).toBeNull();
    // Even a stray fee is not drawn for a collected order.
    screen.unmount();
    show({ ...base, deliveryMode: 'PICKUP', deliveryFee: '49.00' } as SupplierOrder);
    expect(screen.queryByText('Delivery partner fee')).toBeNull();
  });

  it('Free delivery line', () => {
    show({ ...base, deliveryFee: '0.00' } as SupplierOrder);
    expect(screen.getByText('Delivery partner fee')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
  });

  describe('check-in refund (server fields only)', () => {
    const refunded = {
      ...base, status: 'COMPLETED', paymentMethod: 'WALLET', paymentStatus: 'PAID', acceptedAmount: '901.00',
      totalAmount: '901.00', doorstepRefundAmount: '430.50', finalPayableAmount: '470.50',
    } as unknown as SupplierOrder;

    it('shows Refunded to wallet as its own line and the final payable as the last line', () => {
      show(refunded);
      expect(screen.getByText('Refunded to wallet')).toBeTruthy();
      expect(screen.getByText('₹430.50')).toBeTruthy();
      expect(screen.getByText('Paid from wallet')).toBeTruthy();
      expect(screen.getByText('₹470.50')).toBeTruthy();
      // the grand total is still the accepted amount, never worked out
      expect(screen.getByText('₹901.00')).toBeTruthy();
    });

    it('no refund line when the server sent none, or sent zero', () => {
      show({ ...refunded, doorstepRefundAmount: null, finalPayableAmount: null } as unknown as SupplierOrder);
      expect(screen.queryByText(/^Refunded/)).toBeNull();
      screen.unmount();
      show({ ...refunded, doorstepRefundAmount: '0.00', finalPayableAmount: '901.00' } as unknown as SupplierOrder);
      expect(screen.queryByText(/^Refunded/)).toBeNull();
    });

    it('a credit order says the refund came off credit', () => {
      show({ ...refunded, paymentMethod: 'CREDIT', paymentStatus: 'ON_CREDIT' } as unknown as SupplierOrder);
      expect(screen.getByText('Taken off credit')).toBeTruthy();
      expect(screen.queryByText('Refunded to wallet')).toBeNull();
    });
  });
});
