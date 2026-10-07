import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BillSummary, billSummaryFor, itemTaxLine } from '@/components/order/BillSummary';
import { buyerOrderStatus } from '@/models/status';
import type { SupplierOrder } from '@/models/procurement';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const base = {
  status: 'PREPARING', paymentMethod: 'PREPAID', paymentStatus: 'CAPTURED',
  subtotal: '1000.10', gstAmount: '180.20', acceptedSubtotal: '900.00', acceptedGst: '162.00',
  totalAmount: '1234.56', acceptedAmount: null, deliveryFee: '40.00', deliveryMode: 'COSTONOMY_DELIVERY',
} as unknown as SupplierOrder;

describe('delivery fee wording (T15 item 3)', () => {
  const show = (mode: string) => render(<BillSummary {...billSummaryFor({ ...base, deliveryMode: mode } as SupplierOrder, false)} />);

  it('Costonomy delivery says "Delivery partner fee"', () => {
    show('COSTONOMY_DELIVERY');
    expect(screen.getByText('Delivery partner fee')).toBeTruthy();
    expect(screen.getByText('₹40.00')).toBeTruthy();
  });

  it('supplier own delivery says "Delivery fee"', () => {
    show('SUPPLIER_DELIVERY');
    expect(screen.getByText('Delivery fee')).toBeTruthy();
    expect(screen.queryByText('Delivery partner fee')).toBeNull();
    expect(screen.getByText('₹40.00')).toBeTruthy();
  });

  it('supplier own delivery that is free says "Delivery fee" and Free', () => {
    render(<BillSummary {...billSummaryFor({ ...base, deliveryMode: 'SUPPLIER_DELIVERY', deliveryFee: '0.00' } as SupplierOrder, false)} />);
    expect(screen.getByText('Delivery fee')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('pickup has no fee line', () => {
    show('PICKUP');
    expect(screen.queryByText('Delivery fee')).toBeNull();
    expect(screen.queryByText('Delivery partner fee')).toBeNull();
  });
});

describe('item tax sub-line (T15 item 4)', () => {
  const sku = { packSize: '1', packUnit: 'KG', measureValue: null, measureUnit: null } as never;

  it('does not lead with the bare ordering unit when the pack line already shows the pack', () => {
    expect(itemTaxLine({ sku, unit: 'KG', unitPriceInclusiveGst: '430.50', gstRate: '5' })).toBe('Inc. 5% GST');
  });

  it('with no pack description falls back to the ordering unit', () => {
    expect(itemTaxLine({ sku: null, unit: 'KG', unitPriceInclusiveGst: null, gstRate: '5' })).toBe('KG · Inc. 5% GST');
  });

  it('with neither pack nor unit is just the GST', () => {
    expect(itemTaxLine({ sku: null, unit: '', unitPriceInclusiveGst: null, gstRate: '5' })).toBe('Inc. 5% GST');
  });
});

describe('orders list status label (T15 item 5)', () => {
  it('a Costonomy delivery waiting with no partner reads as arranging delivery', () => {
    expect(buyerOrderStatus('READY_FOR_PICKUP', 'COSTONOMY_DELIVERY').label).toBe('Arranging delivery');
  });
  it('pickup keeps Ready for pickup, as the list always showed', () => {
    expect(buyerOrderStatus('READY_FOR_PICKUP', 'PICKUP').label).toBe('Ready for pickup');
  });
  it('supplier delivery and other statuses are unchanged', () => {
    expect(buyerOrderStatus('READY_FOR_PICKUP', 'SUPPLIER_DELIVERY').label).toBe('Ready for pickup');
    expect(buyerOrderStatus('OUT_FOR_DELIVERY', 'COSTONOMY_DELIVERY').label).toBe('Out for delivery');
  });
});
