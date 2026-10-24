import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OperatingHoursFields } from '@/components/supplier/OperatingHoursFields';
import { DisputeStatusChip } from '@/components/dispute/DisputeStatusChip';
import { BillSummary } from '@/components/order/BillSummary';
import { DisputeRefundLines } from '@/components/order/DisputeRefundLines';
import { ACTIVE_PILL_CLEARANCE } from '@/components/delivery/ActiveOrderPill';
import { hoursAreSet, normaliseHours } from '@/lib/supplier/storeHours';
import { fetchDisputes } from '@/services/trust';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/services/trust', () => ({ fetchDisputes: jest.fn() }));

afterEach(() => { cleanup(); jest.clearAllMocks(); });

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

describe('dispute refund line sits inside the bill card', () => {
  it('is drawn within the Bill summary card, not after it', async () => {
    (fetchDisputes as jest.Mock).mockResolvedValue([
      { id: 1, disputeNumber: 'DSP-1', refundRequest: { status: 'APPROVED', amount: '25.00' } },
    ]);
    wrap(
      <BillSummary
        lines={[{ label: 'Item total', amount: '820.00' }]}
        grandTotal="861.00"
        finalLine={{ label: 'Partly refunded', amount: '861.00' }}
        extra={<DisputeRefundLines orderId={79} />}
      />,
    );
    const card = screen.getByTestId('bill-summary');
    expect(await within(card).findByLabelText('Dispute refund DSP-1, -₹25.00')).toBeTruthy();
  });
});

describe('DisputeStatusChip', () => {
  it.each([['OPEN', 'Open'], ['UNDER_REVIEW', 'Under review'], ['RESPONDED', 'Supplier responded'], ['RESOLVED', 'Resolved'], ['REJECTED', 'Rejected']])(
    '%s reads %s', (status, label) => {
      render(<DisputeStatusChip status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByText(status.replace(/_/g, ' ').toLowerCase())).toBeNull();
    },
  );
});

describe('store hours editor when hours are not set', () => {
  const unset = { days: ['MONDAY'], opensAt: '00:00', closesAt: '00:00' };
  it('shows empty time inputs with Opens / Closes placeholders', () => {
    render(<OperatingHoursFields value={unset} onChange={jest.fn()} />);
    const opens = screen.getByPlaceholderText('Opens');
    const closes = screen.getByPlaceholderText('Closes');
    expect(opens.props.value).toBe('');
    expect(closes.props.value).toBe('');
    expect(screen.getByText(/Hours not set/)).toBeTruthy();
  });
  it('typing one time blanks the other rather than keeping 00:00', () => {
    const onChange = jest.fn();
    render(<OperatingHoursFields value={unset} onChange={onChange} />);
    fireEvent.changeText(screen.getByPlaceholderText('Opens'), '09:00');
    expect(onChange).toHaveBeenCalledWith({ days: ['MONDAY'], opensAt: '09:00', closesAt: '' });
  });
  it('set hours still show their times', () => {
    render(<OperatingHoursFields value={{ days: ['MONDAY'], opensAt: '10:00', closesAt: '21:00' }} onChange={jest.fn()} />);
    expect(screen.getByDisplayValue('10:00')).toBeTruthy();
    expect(screen.getByDisplayValue('21:00')).toBeTruthy();
  });
  it('a half-typed pair is not "set"', () => {
    expect(hoursAreSet({ days: ['MONDAY'], opensAt: '09:00', closesAt: '' })).toBe(false);
    expect(hoursAreSet({ days: ['MONDAY'], opensAt: '09:00', closesAt: '17:00' })).toBe(true);
  });
});

describe('normaliseHours (what the store form saves)', () => {
  it('both blank keeps the unset pair the server already holds', () => {
    expect(normaliseHours({ days: ['MONDAY'], opensAt: '', closesAt: '' }))
      .toEqual({ hours: { days: ['MONDAY'], opensAt: '00:00', closesAt: '00:00' }, problem: null });
  });
  it('one blank is a problem, nothing is guessed', () => {
    expect(normaliseHours({ days: ['MONDAY'], opensAt: '09:00', closesAt: '' }).problem).toMatch(/both/i);
  });
  it('set hours pass through unchanged', () => {
    const h = { days: ['MONDAY'], opensAt: '10:00', closesAt: '21:00' };
    expect(normaliseHours(h)).toEqual({ hours: h, problem: null });
  });
});

describe('Home pill clearance', () => {
  it('clears the floating pill (min height + its bottom offset) with room to spare', () => {
    expect(ACTIVE_PILL_CLEARANCE).toBeGreaterThanOrEqual(100);
  });
});
