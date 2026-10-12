import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AmountRow } from '@/components/order/AmountRow';
import { BillSummary } from '@/components/order/BillSummary';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const style = (node: { props: { style?: unknown } }): Record<string, any> => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, any>;

describe('AmountRow', () => {
  it('lets the label wrap and keeps the amount whole, on one line, right aligned', () => {
    render(<AmountRow label="CN-261006-000001 refund for a very long reason that needs two lines" amount="-₹26.00" />);
    const label = screen.getByText(/CN-261006-000001 refund/);
    const amount = screen.getByText('-₹26.00');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(style(label).flex).toBe(1);
    expect(amount.props.numberOfLines).toBe(1);
    expect(style(amount).flexShrink).toBe(0);
    expect(style(amount).textAlign).toBe('right');
  });

  it('is one accessible element that reads label then amount', () => {
    render(<AmountRow label="Refund" amount="₹100.00" />);
    expect(screen.getByLabelText('Refund, ₹100.00')).toBeTruthy();
  });
});

describe('the bill summary refund line', () => {
  it('keeps the amount whole and right aligned while the label wraps', () => {
    render(
      <BillSummary
        lines={[]}
        grandTotal="1000.00"
        refundLine={{ label: 'Refunded to your original payment method', amount: '26.00' }}
        finalLine={{ label: 'Final payable', amount: '974.00' }}
      />,
    );
    const amount = screen.getByText('₹26.00');
    expect(amount.props.numberOfLines).toBe(1);
    expect(style(amount).flexShrink).toBe(0);
    expect(style(amount).textAlign).toBe('right');
    expect(style(screen.getByText('Refunded to your original payment method')).flex).toBe(1);
  });
});
