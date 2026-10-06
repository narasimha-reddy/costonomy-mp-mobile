import React from 'react';
import { Linking, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';
import { PartnerSearchPanel } from '@/components/delivery/PartnerSearchPanel';
import { DeliveredSummaryCard } from '@/components/delivery/DeliveredSummaryCard';
import { CollapsibleSection } from '@/components/order/CollapsibleSection';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

const NOW = Date.parse('2026-01-01T10:10:00Z');
const stopped = {
  mode: 'COSTONOMY' as const, status: 'QUOTE_FAILED' as const, failureReason: 'No riders in range',
  canSwitchToOwn: true, retryUntil: null, searchStartedAt: null,
};

describe('DeliveryPartnerCard', () => {
  it('calls the partner on the phone number', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<DeliveryPartnerCard name="Ravi Kumar" vehicle="Bike" phone="9999999999" showCall />);
    expect(screen.getByText('RK', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Call Ravi Kumar'));
    expect(open).toHaveBeenCalledWith('tel:9999999999');
  });

  it('has no call button without a phone or when calls are off', () => {
    const { rerender } = render(<DeliveryPartnerCard name="Ravi" phone={null} showCall />);
    expect(screen.queryByLabelText('Call Ravi')).toBeNull();
    rerender(<DeliveryPartnerCard name="Ravi" phone="123" showCall={false} />);
    expect(screen.queryByLabelText('Call Ravi')).toBeNull();
  });
});

describe('PartnerSearchPanel', () => {
  it('fires retry and switch for the supplier, and shows the reason', () => {
    const onRetry = jest.fn();
    const onSwitchOwn = jest.fn();
    render(<PartnerSearchPanel audience="supplier" delivery={stopped} nowMs={NOW} onRetry={onRetry} onSwitchOwn={onSwitchOwn} />);
    expect(screen.getByText('No riders in range')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    fireEvent.press(screen.getByText("I'll deliver it myself"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSwitchOwn).toHaveBeenCalledTimes(1);
  });

  it('hides the switch when the server has not allowed it', () => {
    render(<PartnerSearchPanel audience="supplier" delivery={{ ...stopped, canSwitchToOwn: false }} nowMs={NOW} onRetry={jest.fn()} onSwitchOwn={jest.fn()} />);
    expect(screen.queryByText("I'll deliver it myself")).toBeNull();
  });

  it('shows the buyer an indeterminate bar and never the reason or any action', () => {
    const { rerender } = render(<PartnerSearchPanel audience="buyer" delivery={{ ...stopped, status: 'DELIVERY_REQUESTED' }} nowMs={NOW} />);
    expect(screen.getByText('This usually takes a few minutes')).toBeTruthy();
    rerender(<PartnerSearchPanel audience="buyer" delivery={stopped} nowMs={NOW} onRetry={jest.fn()} />);
    expect(screen.queryByText('No riders in range')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('labels the supplier bar with minutes elapsed of the window', () => {
    render(<PartnerSearchPanel audience="supplier" nowMs={NOW}
      delivery={{ ...stopped, status: 'PROVIDER_SELECTED', searchStartedAt: '2026-01-01T10:00:00Z', retryUntil: '2026-01-01T10:20:00Z' }} />);
    expect(screen.getByText('Searching for a partner… 10 of 20 min')).toBeTruthy();
  });
});

describe('DeliveredSummaryCard', () => {
  it('names who delivered, offers receive to the buyer only, and has no call', () => {
    const onReceive = jest.fn();
    render(<DeliveredSummaryCard audience="buyer" driverName="Ravi" deliveredAt="2026-01-01T10:10:00Z" onReceive={onReceive} />);
    expect(screen.getByText('Delivered by Ravi')).toBeTruthy();
    expect(screen.queryByLabelText(/Call/)).toBeNull();
    fireEvent.press(screen.getByText('Inspect and receive goods'));
    expect(onReceive).toHaveBeenCalled();
  });
});

describe('CollapsibleSection', () => {
  it('toggles and reports expanded state', () => {
    render(<CollapsibleSection title="Order summary" summary="3 items · ₹100"><Text>body</Text></CollapsibleSection>);
    const header = screen.getByRole('button');
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByText('body')).toBeNull();
    expect(screen.getByText('3 items · ₹100')).toBeTruthy();
    fireEvent.press(header);
    expect(screen.getByRole('button').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('can start open', () => {
    render(<CollapsibleSection title="Activity" defaultOpen><Text>body</Text></CollapsibleSection>);
    expect(screen.getByText('body')).toBeTruthy();
  });
});
