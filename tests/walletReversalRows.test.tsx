import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { NO_FILTERS, buildTransactionsQuery, categoryLabel, presentEntry } from '@/lib/wallet/history';
import type { WalletEntry } from '@/models/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const NOW = new Date('2026-09-29T12:00:00Z');
const entry = (over: Record<string, unknown> = {}): WalletEntry => ({
  id: 1, direction: 'DEBIT', kind: 'WITHDRAWAL', amount: '500.0000', balanceAfter: '0.0000',
  supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-28T12:00:00Z', ...over,
} as WalletEntry);

describe('history rows and the withdrawal copy', () => {
  it('a WITHDRAWAL_REVERSAL is a credit that says the money came back', () => {
    const view = presentEntry(entry({ kind: 'WITHDRAWAL_REVERSAL', direction: 'CREDIT', status: 'COMPLETED' }));
    expect(view.title).toBe('Withdrawal returned to your wallet');
    expect(view.category).toBe('Withdrawal');
    expect(view.sign).toBe('+');
    expect(view.tone).toBe('credit');
    render(<TransactionRow entry={entry({ kind: 'WITHDRAWAL_REVERSAL', direction: 'CREDIT' })} now={NOW} />);
    expect(screen.getByText('Received from')).toBeTruthy();
    expect(screen.getByText('Returned withdrawal')).toBeTruthy();
    expect(screen.getByText('+ ₹500')).toBeTruthy();
  });

  it('each withdrawal refund status reads the same in a history row as in the wallet copy', () => {
    const chip = (refundStatus: string, status?: string) =>
      presentEntry(entry({ refundStatus, status })).chip;
    expect(chip('REQUESTED', 'IN_PROGRESS')).toEqual({ label: 'On its way', tone: 'pending' });
    expect(chip('PROCESSING', 'IN_PROGRESS')).toEqual({ label: 'On its way', tone: 'pending' });
    expect(chip('COMPLETED', 'IN_PROGRESS')).toEqual({ label: 'Sent', tone: 'success' });
    expect(chip('COMPLETED')).toEqual({ label: 'Sent', tone: 'success' });
    expect(chip('FAILED', 'FAILED')).toEqual({ label: 'Retrying', tone: 'pending' });
    expect(chip('NEEDS_REVIEW')?.tone).toBe('warning');
    expect(chip('REJECTED')).toEqual({ label: 'Checking', tone: 'warning' });
    expect(chip('REVERSED')).toEqual({ label: "Couldn't be sent · back in your wallet", tone: 'neutral' });
  });

  it('the server saying RETURNED wins over a stale refund status', () => {
    const view = presentEntry(entry({ refundStatus: 'COMPLETED', status: 'RETURNED' }));
    expect(view.chip).toEqual({ label: 'Returned to your bank/card', tone: 'neutral' });
    expect(view.sign).toBe('');
  });

  it('an unknown refund status or entry status never claims success or progress', () => {
    expect(presentEntry(entry({ refundStatus: 'SOMETHING_NEW' })).chip)
      .toEqual({ label: 'Status unavailable', tone: 'neutral' });
    const odd = presentEntry(entry({ kind: 'NEW_KIND', status: 'ODD', direction: 'CREDIT' }));
    expect(odd.title).toBe('Money in');
    expect(odd.chip).toBeNull();
    expect(presentEntry(entry({ kind: 'NEW_KIND', direction: 'DEBIT' })).title).toBe('Money out');
  });

  it('non-withdrawals ignore refundStatus, and plain statuses keep their chips', () => {
    expect(presentEntry(entry({ kind: 'REFUND', direction: 'CREDIT', refundStatus: 'COMPLETED' })).chip).toBeNull();
    expect(presentEntry(entry({ status: 'IN_PROGRESS' })).chip).toEqual({ label: 'On its way', tone: 'pending' });
    expect(presentEntry(entry({ kind: 'ORDER_PAYMENT', status: 'FAILED' })).chip)
      .toEqual({ label: 'Failed', tone: 'danger' });
  });

  it('the Withdrawal filter also asks for reversals, and their category is Withdrawal', () => {
    expect(categoryLabel('WITHDRAWAL_REVERSAL')).toBe('Withdrawal');
    const query = buildTransactionsQuery({ filters: { ...NO_FILTERS, categories: ['WITHDRAWAL'] } });
    expect(decodeURIComponent(query)).toBe('?kinds=WITHDRAWAL,WITHDRAWAL_REVERSAL');
  });
});
