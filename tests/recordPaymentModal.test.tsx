import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RecordPaymentModal } from '@/components/credit/RecordPaymentModal';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { recordPayment } from '@/services/credit';
import type { CreditInvoice } from '@/models/credit';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/credit', () => ({ recordPayment: jest.fn() }));
let mockKeyCounter = 0;
jest.mock('@/lib/api/client', () => ({ newIdempotencyKey: () => `key-${++mockKeyCounter}` }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

const invoice = { id: 9, invoiceNumber: 'CINV-9', amount: 1050, outstanding: 1050, dueDate: '2026-11-04' } as unknown as CreditInvoice;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <RecordPaymentModal visible onClose={jest.fn()} invoice={invoice} agreementId={4} storeId={12} />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const keys = () => (recordPayment as jest.Mock).mock.calls.map((call) => call[3]);

beforeEach(() => {
  jest.clearAllMocks();
  mockKeyCounter = 0;
});

describe('recording a repayment twice by retrying', () => {
  it('is not possible: a retry after a network failure carries the same key', async () => {
    (recordPayment as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue({});
    setup();

    fireEvent.press(screen.getByText('Confirm Payment'));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByText('Confirm Payment'));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2));

    expect(keys()[1]).toBe(keys()[0]);
  });

  it('takes a new key once the server refused it', async () => {
    (recordPayment as jest.Mock)
      .mockRejectedValueOnce(new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Amount exceeds the outstanding balance.' }))
      .mockResolvedValue({});
    setup();

    fireEvent.press(screen.getByText('Confirm Payment'));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByText('Confirm Payment'));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2));

    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it('takes a new key when what is being paid changes', async () => {
    (recordPayment as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue({});
    setup();

    fireEvent.press(screen.getByText('Confirm Payment'));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByDisplayValue('1050'), '500');
    fireEvent.press(await screen.findByText('Confirm Payment'));
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2));

    expect(keys()[1]).not.toBe(keys()[0]);
  });
});

describe('the payment-mode chips', () => {
  it('say what they are and which is chosen', () => {
    setup();
    const upi = screen.getByLabelText('UPI');
    expect(upi.props.accessibilityRole).toBe('radio');
    expect(upi.props.accessibilityState.checked).toBe(false);
    expect(screen.getByLabelText('Bank Transfer / NEFT').props.accessibilityState.checked).toBe(true);
  });
});
