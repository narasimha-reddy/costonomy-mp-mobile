import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
  it('shows category, title, age, +amount and where it was paid from', () => {
    render(<TransactionRow entry={entry()} now={NOW} />);
    expect(screen.getByText('Top-up')).toBeTruthy();
    expect(screen.getByText('Money added')).toBeTruthy();
    expect(screen.getByText('1 day ago')).toBeTruthy();
    expect(screen.getByText('+₹500.00')).toBeTruthy();
    expect(screen.getByText('Debited from Card •1007')).toBeTruthy();
    expect(screen.queryByText('On its way')).toBeNull();
  });

  it('a debit reads −amount', () => {
    render(<TransactionRow entry={entry({ direction: 'DEBIT', kind: 'ORDER_PAYMENT', instrument: null })} now={NOW} />);
    expect(screen.getByText('−₹500.00')).toBeTruthy();
    expect(screen.getByText('Order payment')).toBeTruthy();
    expect(screen.queryByText(/Debited from/)).toBeNull();
  });

  it('IN_PROGRESS carries the On its way chip', () => {
    render(<TransactionRow entry={entry({ direction: 'DEBIT', kind: 'WITHDRAWAL', status: 'IN_PROGRESS', instrument: 'UPI' })} now={NOW} />);
    expect(screen.getByText('On its way')).toBeTruthy();
    expect(screen.getByText('Sent to UPI')).toBeTruthy();
  });

  it('RETURNED shows the amount with no sign and the returned chip', () => {
    render(<TransactionRow entry={entry({ direction: 'DEBIT', kind: 'WITHDRAWAL', status: 'RETURNED' })} now={NOW} />);
    expect(screen.getByText('₹500.00')).toBeTruthy();
    expect(screen.queryByText('−₹500.00')).toBeNull();
    expect(screen.getByText('Returned to your bank/card')).toBeTruthy();
  });

  it('copes with an older API row: no status or instrument', () => {
    render(<TransactionRow entry={entry({ status: undefined, instrument: undefined })} now={NOW} />);
    expect(screen.getByText('+₹500.00')).toBeTruthy();
  });
});

describe('MonthHeader', () => {
  it('shows the month and what was spent', () => {
    render(<MonthHeader title="September 2026" spent="₹1,250" />);
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByText('₹1,250 spent')).toBeTruthy();
  });
  it('shows the name alone with no total', () => {
    render(<MonthHeader title="September 2026" spent={null} />);
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.queryByText(/spent/)).toBeNull();
  });
});
