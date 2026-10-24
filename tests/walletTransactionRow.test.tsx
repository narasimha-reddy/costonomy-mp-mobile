import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { WalletColors } from '@/theme';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { MonthHeader } from '@/components/wallet/MonthHeader';
import type { WalletEntry } from '@/models/wallet';

// The icon font loader needs native modules the test runtime does not have.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const NOW = new Date('2026-09-29T12:00:00Z');

function entry(over: Partial<WalletEntry> = {}): WalletEntry {
  return {
    id: 1, direction: 'CREDIT', kind: 'TOP_UP', amount: '500.0000', balanceAfter: '1500.0000',
    supplierOrderId: null, reason: null, refundStatus: null, status: 'COMPLETED',
    instrument: 'Card •1007', at: '2026-09-28T12:00:00Z', ...over,
  };
}

describe('TransactionRow', () => {
  it('a top-up shows label, the card, age, + amount and the wallet line', () => {
    render(<TransactionRow entry={entry()} now={NOW} />);
    expect(screen.getByText('Added to wallet')).toBeTruthy();
    expect(screen.getByText('Card •••• 1007')).toBeTruthy();
    expect(screen.getByText('1 day ago')).toBeTruthy();
    expect(screen.getByText('+ ₹500')).toBeTruthy();
    expect(screen.getByText('Credited to wallet')).toBeTruthy();
    expect(screen.getByText('icon:wallet-outline')).toBeTruthy();
    expect(screen.getByTestId('avatar-in')).toBeTruthy();
    expect(screen.queryByText('On its way')).toBeNull();
  });

  it('a debit reads the plain amount, "Paid to", the order and "Debited from wallet"', () => {
    render(<TransactionRow
      entry={entry({ direction: 'DEBIT', kind: 'ORDER_PAYMENT', instrument: null, reason: 'Order MP-260919-000013 payment' })}
      now={NOW}
    />);
    expect(screen.getByText('₹500')).toBeTruthy();
    expect(screen.getByText('Paid to')).toBeTruthy();
    expect(screen.getByText('Order MP-260919-000013')).toBeTruthy();
    expect(screen.getByText('Debited from wallet')).toBeTruthy();
    expect(screen.getByTestId('avatar-out')).toBeTruthy();
  });

  it('IN_PROGRESS carries the On its way chip under the time', () => {
    render(<TransactionRow entry={entry({ direction: 'DEBIT', kind: 'WITHDRAWAL', status: 'IN_PROGRESS', instrument: 'UPI' })} now={NOW} />);
    expect(screen.getByText('On its way')).toBeTruthy();
    expect(screen.getByText('Withdrawal to')).toBeTruthy();
    expect(screen.getByText('UPI')).toBeTruthy();
  });

  it('RETURNED shows the amount with no sign and the returned chip', () => {
    render(<TransactionRow entry={entry({ direction: 'DEBIT', kind: 'WITHDRAWAL', status: 'RETURNED' })} now={NOW} />);
    expect(screen.getByText('₹500')).toBeTruthy();
    expect(screen.queryByText(/\+/)).toBeNull();
    expect(screen.getByText('Returned to your bank/card')).toBeTruthy();
  });

  it('copes with an older API row: no status or instrument', () => {
    render(<TransactionRow entry={entry({ status: undefined, instrument: undefined })} now={NOW} />);
    expect(screen.getByText('+ ₹500')).toBeTruthy();
    expect(screen.getByText('Wallet top-up')).toBeTruthy();
  });

  it('is a button that opens the entry when given onPress, and a plain row otherwise', () => {
    const onPress = jest.fn();
    const { rerender } = render(<TransactionRow entry={entry()} now={NOW} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<TransactionRow entry={entry()} now={NOW} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has a rule under it unless it is the last of its group', () => {
    const { rerender } = render(<TransactionRow entry={entry()} now={NOW} />);
    expect(screen.getByTestId('row-divider')).toBeTruthy();
    rerender(<TransactionRow entry={entry()} now={NOW} last />);
    expect(screen.queryByTestId('row-divider')).toBeNull();
  });

  it('reads as one sentence for a screen reader', () => {
    render(<TransactionRow entry={entry()} now={NOW} onPress={() => {}} />);
    expect(screen.getByLabelText('Added to wallet Card •••• 1007, + ₹500, 1 day ago, Credited to wallet')).toBeTruthy();
  });
});

describe('MonthHeader', () => {
  it('shows the month, the net and a chevron', () => {
    render(<MonthHeader title="October 2026" amount="+ ₹48,876" credit />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByText('+ ₹48,876')).toBeTruthy();
    expect(screen.getByText('icon:chevron-forward')).toBeTruthy();
    expect(screen.getByLabelText('October 2026, + ₹48,876')).toBeTruthy();
  });
  it('shows the name alone with no total', () => {
    render(<MonthHeader title="September 2026" amount={null} />);
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.queryByText('icon:chevron-forward')).toBeNull();
  });
  it('the stuck band carries the hairline, the others do not', () => {
    const { rerender } = render(<MonthHeader title="September 2026" amount="₹10" stuck />);
    expect(StyleSheet.flatten(screen.getByTestId('month-September 2026').props.style).borderTopColor)
      .toBe(WalletColors.bandHairline);
    rerender(<MonthHeader title="September 2026" amount="₹10" />);
    expect(StyleSheet.flatten(screen.getByTestId('month-September 2026').props.style).borderTopColor)
      .toBe(WalletColors.bandBackground);
  });
});

describe('TransactionRow credit repayment', () => {
  const repayment = (over: Partial<WalletEntry> = {}) => entry({
    direction: 'DEBIT', kind: 'CREDIT_REPAYMENT', instrument: null, reason: 'Credit repayment', ...over,
  });

  it('shows Paid to, the title, a debit amount and no bill chip when the server sends bill: null', () => {
    render(<TransactionRow entry={repayment({ bill: null })} now={NOW} onBillPress={jest.fn()} />);
    expect(screen.getByText('Paid to')).toBeTruthy();
    expect(screen.getByText('Credit repayment')).toBeTruthy();
    expect(screen.getByText('₹500')).toBeTruthy();
    expect(screen.getByText('Debited from wallet')).toBeTruthy();
    expect(screen.getByTestId('avatar-out')).toBeTruthy();
    expect(screen.queryByTestId('row-bill-chip')).toBeNull();
  });

  it('shows no bill chip even if a bill status were sent (bill tracking has started)', () => {
    render(<TransactionRow entry={repayment({ bill: { status: 'PENDING' } as never })} now={NOW} onBillPress={jest.fn()} mayAddBill />);
    expect(screen.queryByTestId('row-bill-chip')).toBeNull();
    expect(screen.queryByText(/bill/i)).toBeNull();
  });
});
