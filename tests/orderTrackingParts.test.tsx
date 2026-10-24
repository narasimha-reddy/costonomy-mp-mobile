import React from 'react';
import { Linking, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';
import { PartnerSearchPanel } from '@/components/delivery/PartnerSearchPanel';
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
    render(<DeliveryPartnerCard name="Ravi Kumar" vehicle="KA 05 AB 1234" phone="9999999999" showCall />);
    expect(screen.getByText('RK', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('KA 05 AB 1234')).toBeTruthy();
    expect(screen.getByText('Your delivery partner')).toBeTruthy();
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

describe('DeliveryPartnerCard, delivered', () => {
  it('names who delivered, with no call and no masked-number line', () => {
    render(<DeliveryPartnerCard name="Ravi Kumar" vehicle="KA 05 AB 1234" phone="9999999999" showCall delivered />);
    expect(screen.getByText('Delivered by Ravi Kumar')).toBeTruthy();
    expect(screen.queryByLabelText(/Call/)).toBeNull();
    expect(screen.queryByText(/masked/i)).toBeNull();
  });

  it('shows a long name in full', () => {
    render(<DeliveryPartnerCard name="Venkata Subramanian Raghavan" showCall={false} />);
    expect(screen.getByText('Venkata Subramanian Raghavan').props.numberOfLines).toBeUndefined();
  });
});

describe('PartnerSearchPanel', () => {
  it('fires retry and switch for the supplier, and leaves the reason to the hero', () => {
    const onRetry = jest.fn();
    const onSwitchOwn = jest.fn();
    render(<PartnerSearchPanel audience="supplier" delivery={stopped} nowMs={NOW} onRetry={onRetry} onSwitchOwn={onSwitchOwn} />);
    expect(screen.queryByText('No riders in range')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    fireEvent.press(screen.getByText('I will deliver it myself'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSwitchOwn).toHaveBeenCalledTimes(1);
  });

  it('hides the switch when the server has not allowed it', () => {
    render(<PartnerSearchPanel audience="supplier" delivery={{ ...stopped, canSwitchToOwn: false }} nowMs={NOW} onRetry={jest.fn()} onSwitchOwn={jest.fn()} />);
    expect(screen.queryByText('I will deliver it myself')).toBeNull();
  });

  it('reassures the buyer while a partner is found and never shows the reason or any action', () => {
    const { rerender } = render(<PartnerSearchPanel audience="buyer" delivery={{ ...stopped, status: 'DELIVERY_REQUESTED' }} nowMs={NOW} />);
    expect(screen.getByText('Assigning a partner')).toBeTruthy();
    expect(screen.getByText('Your order is packed. You do not need to do anything.')).toBeTruthy();
    rerender(<PartnerSearchPanel audience="buyer" delivery={stopped} nowMs={NOW} onRetry={jest.fn()} />);
    expect(screen.queryByText('No riders in range')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText('Try again now')).toBeNull();
  });

  it('labels the supplier bar with minutes elapsed of the window and retries on Try again now', () => {
    const onRetry = jest.fn();
    render(<PartnerSearchPanel audience="supplier" nowMs={NOW} onRetry={onRetry}
      delivery={{ ...stopped, status: 'PROVIDER_SELECTED', searchStartedAt: '2026-01-01T10:00:00Z', retryUntil: '2026-01-01T10:20:00Z' }} />);
    expect(screen.getByText('Searching for a partner')).toBeTruthy();
    expect(screen.getByText('10 of 20 min')).toBeTruthy();
    expect(screen.getByText('Auto-retrying')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again now'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('PartnerSearchPanel "Try again now" waits for a search that is really stuck', () => {
  afterEach(() => { jest.useRealTimers(); });
  const searching = (startedAgoMs: number) => ({
    ...stopped, status: 'PROVIDER_SELECTED' as const,
    searchStartedAt: new Date(NOW - startedAgoMs).toISOString(), retryUntil: new Date(NOW + 600000).toISOString(),
  });

  it('is hidden at the start of the search and appears after 60 s', () => {
    jest.useFakeTimers();
    render(<PartnerSearchPanel audience="supplier" nowMs={NOW} onRetry={jest.fn()} delivery={searching(5000)} />);
    expect(screen.getByText('Searching for a partner')).toBeTruthy();
    expect(screen.queryByText('Try again now')).toBeNull();
    act(() => { jest.advanceTimersByTime(54000); });
    expect(screen.queryByText('Try again now')).toBeNull();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.getByText('Try again now')).toBeTruthy();
  });

  it('is shown at once when the server says the search began over a minute ago', () => {
    render(<PartnerSearchPanel audience="supplier" nowMs={NOW} onRetry={jest.fn()} delivery={searching(90000)} />);
    expect(screen.getByText('Try again now')).toBeTruthy();
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
