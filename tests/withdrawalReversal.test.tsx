import React from 'react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { entryLabel, withdrawalProgress } from '@/lib/wallet/entryCopy';
import { offeredAmount, withdrawFailure, PAUSED_FALLBACK } from '@/lib/wallet/withdrawError';
import { formatMoney } from '@/utils/money';
import type { WalletEntry } from '@/models/wallet';

// No type package for it in this repo; the hook is exercised through a bare probe component.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

const entry = (extra: Partial<WalletEntry> | Record<string, unknown>): WalletEntry => ({
  id: 1, direction: 'CREDIT', kind: 'REFUND', amount: '100.00', balanceAfter: '100.00',
  supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-27T10:00:00Z', ...extra,
} as WalletEntry);

const err = (status: number, code: string, details?: Record<string, unknown>, message = 'Server words') =>
  new ApiError({ code, message, status, details });

describe('entryLabel', () => {
  it('names every kind, in both directions', () => {
    const expected: Record<string, string> = {
      TOP_UP: 'Money added',
      ORDER_PAYMENT: 'Paid for an order',
      ORDER_REFUND: 'Order cancelled · money back',
      REFUND: 'Refund',
      DISPUTE_REFUND: 'Refund from a dispute',
      WITHDRAWAL: 'Sent back to your card or bank',
      WITHDRAWAL_REVERSAL: 'Withdrawal returned to your wallet',
    };
    for (const [kind, label] of Object.entries(expected)) {
      for (const direction of ['CREDIT', 'DEBIT']) {
        expect(entryLabel(entry({ kind, direction }))).toBe(label);
      }
    }
  });

  it('falls back to a neutral label for an unknown kind or direction', () => {
    expect(entryLabel(entry({ kind: 'SOMETHING_NEW', direction: 'CREDIT' }))).toBe('Money in');
    expect(entryLabel(entry({ kind: 'SOMETHING_NEW', direction: 'DEBIT' }))).toBe('Money out');
    expect(entryLabel(entry({ kind: 'SOMETHING_NEW', direction: 'SIDEWAYS' }))).toBe('Wallet activity');
    expect(entryLabel(entry({ kind: undefined, direction: undefined }))).toBe('Wallet activity');
  });
});

describe('withdrawalProgress', () => {
  const progress = (refundStatus: unknown, kind = 'WITHDRAWAL') =>
    withdrawalProgress(entry({ kind, refundStatus }));

  it('maps every status', () => {
    expect(progress('REQUESTED')).toEqual({ label: 'On its way', tone: 'pending' });
    expect(progress('PROCESSING')).toEqual({ label: 'On its way', tone: 'pending' });
    expect(progress('COMPLETED')).toEqual({ label: 'Sent', tone: 'success' });
    expect(progress('FAILED')).toEqual({ label: 'Retrying', tone: 'pending' });
    expect(progress('NEEDS_REVIEW')?.tone).toBe('warning');
    expect(progress('NEEDS_REVIEW')?.label).toContain('checking');
    expect(progress('REJECTED')).toEqual({ label: 'Checking', tone: 'warning' });
    expect(progress('REVERSED')).toEqual({ label: "Couldn't be sent · back in your wallet", tone: 'neutral' });
  });

  it('never claims success or progress for an unknown status', () => {
    expect(progress('SOMETHING_NEW')).toEqual({ label: 'Status unavailable', tone: 'neutral' });
    expect(progress('')).toEqual({ label: 'Status unavailable', tone: 'neutral' });
  });

  it('shows nothing without a status, and nothing for any other kind', () => {
    expect(progress(null)).toBeNull();
    expect(progress(undefined)).toBeNull();
    const statuses = ['REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW', 'REJECTED', 'REVERSED', 'X'];
    const kinds = ['TOP_UP', 'ORDER_PAYMENT', 'ORDER_REFUND', 'REFUND', 'DISPUTE_REFUND', 'WITHDRAWAL_REVERSAL', 'NEW'];
    for (const kind of kinds) for (const s of statuses) expect(progress(s, kind)).toBeNull();
  });
});

describe('withdrawFailure', () => {
  const details = { requested: 1000, withdrawableNow: 600, blocked: 300, unavailable: 100, reason: 'SOURCE_BLOCKED' };

  it('reads the 422 with the amount that can go', () => {
    const out = withdrawFailure(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', details, 'Only ₹600 can go back.'));
    expect(out).toEqual({ kind: 'EXCEEDS_REFUNDABLE', message: 'Only ₹600 can go back.',
      withdrawableNow: '600.00', reason: 'SOURCE_BLOCKED' });
  });

  it('formats the offered amount only with formatMoney', () => {
    const out = withdrawFailure(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', { ...details, withdrawableNow: 1234.5 }));
    expect(out.kind === 'EXCEEDS_REFUNDABLE' && out.withdrawableNow).toBe('1234.50');
    expect(formatMoney('1234.50')).toBe('₹1,234.50');
    expect(`Withdraw ${formatMoney('600.00')} instead`).toBe('Withdraw ₹600.00 instead');
  });

  it('offers nothing when withdrawableNow is 0, missing, negative or unreadable', () => {
    for (const bad of [0, -5, null, undefined, 'abc', '', NaN, Infinity, {}, [], '0', '0.00', '-1']) {
      const out = withdrawFailure(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', { ...details, withdrawableNow: bad }, 'No.'));
      expect(out).toMatchObject({ kind: 'EXCEEDS_REFUNDABLE', message: 'No.', withdrawableNow: null });
    }
  });

  it('survives missing or invalid details and an unknown reason', () => {
    for (const d of [undefined, {}, { reason: 42 }] as (Record<string, unknown> | undefined)[]) {
      expect(withdrawFailure(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', d, 'Words.')))
        .toEqual({ kind: 'EXCEEDS_REFUNDABLE', message: 'Words.', withdrawableNow: null, reason: null });
    }
    const odd = withdrawFailure(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', { ...details, reason: 'NEW_REASON' }));
    expect(odd).toMatchObject({ withdrawableNow: '600.00', reason: null });
    const none = withdrawFailure(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', { ...details, reason: 'NO_REFUND_MONEY', withdrawableNow: 0 }));
    expect(none).toMatchObject({ withdrawableNow: null, reason: 'NO_REFUND_MONEY' });
  });

  it('accepts an amount sent as a plain string', () => {
    expect(offeredAmount('600.00')).toBe('600.00');
    expect(offeredAmount(' 75 ')).toBe('75');
    expect(offeredAmount('1e3')).toBeNull();
  });

  it('uses the server sentence for a pause, and ours only when it sent none', () => {
    expect(withdrawFailure(err(503, 'WITHDRAWALS_PAUSED', undefined, 'Paused, safe.')))
      .toEqual({ kind: 'PAUSED', message: 'Paused, safe.' });
    expect(withdrawFailure(err(503, 'WITHDRAWALS_PAUSED', undefined, '  ')))
      .toEqual({ kind: 'PAUSED', message: PAUSED_FALLBACK });
    expect(PAUSED_FALLBACK).toBe('Withdrawals are paused for a short while. Your money is safe in your wallet.');
  });

  it('keeps older API behaviour: every other error shows its own message', () => {
    expect(withdrawFailure(err(400, 'VALIDATION_ERROR', undefined, 'Above your balance.')))
      .toEqual({ kind: 'OTHER', message: 'Above your balance.' });
    expect(withdrawFailure(err(422, 'SOMETHING_ELSE', undefined, 'Older refusal.')))
      .toEqual({ kind: 'OTHER', message: 'Older refusal.' });
    expect(withdrawFailure(err(503, 'PROVIDER_UNAVAILABLE', undefined, 'Try later.')))
      .toEqual({ kind: 'OTHER', message: 'Try later.' });
    expect(withdrawFailure(err(409, 'IDEMPOTENCY_CONFLICT', undefined, 'previous attempt failed')).kind).toBe('OTHER');
    expect(withdrawFailure(err(500, 'X', undefined, ''))).toEqual({ kind: 'OTHER', message: 'Could not send that. Try again.' });
    expect(withdrawFailure(new NetworkError())).toEqual({ kind: 'OTHER', message: 'Could not send that. Try again.' });
    expect(withdrawFailure(new Error('x'))).toEqual({ kind: 'OTHER', message: 'Could not send that. Try again.' });
    expect(withdrawFailure(undefined).kind).toBe('OTHER');
  });
});

describe('idempotency key across withdrawal outcomes', () => {
  function harness() {
    let api!: ReturnType<typeof useIdempotencyKey>;
    function Probe() { api = useIdempotencyKey(); return null; }
    act(() => { create(<Probe />); });
    return () => api;
  }

  const keyAfter = (caught?: unknown) => {
    const get = harness();
    const first = get().key();
    expect(get().key()).toBe(first);
    get().settle(caught);
    return { first, second: get().key() };
  };

  it('drops the key after a 422 (so "instead" is a new request)', () => {
    const { first, second } = keyAfter(err(422, 'WITHDRAWAL_EXCEEDS_REFUNDABLE', { withdrawableNow: 600 }));
    expect(second).not.toBe(first);
  });

  it('drops the key after a 400 and after success', () => {
    const a = keyAfter(err(400, 'VALIDATION_ERROR')); expect(a.second).not.toBe(a.first);
    const b = keyAfter(); expect(b.second).not.toBe(b.first);
  });

  it('keeps the key after a paused 503', () => {
    const { first, second } = keyAfter(err(503, 'WITHDRAWALS_PAUSED'));
    expect(second).toBe(first);
  });

  it('keeps the key after another 5xx, a network error and a throttle', () => {
    for (const caught of [err(500, 'X'), err(502, 'X'), err(503, 'PROVIDER_UNAVAILABLE'), new NetworkError(),
      err(429, 'RATE_LIMITED'), err(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS')]) {
      const { first, second } = keyAfter(caught);
      expect(second).toBe(first);
    }
  });
});
