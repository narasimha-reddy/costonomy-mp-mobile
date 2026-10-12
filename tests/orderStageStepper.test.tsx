import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { OrderStageStepper } from '@/components/delivery/OrderStageStepper';
import { OrderProgressHero } from '@/components/delivery/OrderProgressHero';
import { orderTrackingView, stagesFor } from '@/lib/delivery/orderTracking';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

let reduce: jest.SpyInstance;
beforeEach(() => {
  reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

const steps = stagesFor('COSTONOMY_DELIVERY', 'COSTONOMY');

describe('OrderStageStepper', () => {
  it('labels the whole bar and each step with its state', () => {
    render(<OrderStageStepper steps={steps} currentIndex={3} />);
    expect(screen.getByLabelText('Step 4 of 7: Partner assigned')).toBeTruthy();
    expect(screen.getByLabelText('Confirmed, done')).toBeTruthy();
    expect(screen.getByLabelText('Partner assigned, current')).toBeTruthy();
    expect(screen.getByLabelText('Delivered, upcoming')).toBeTruthy();
  });

  it('shows a check on done steps so state is not colour alone', () => {
    render(<OrderStageStepper steps={steps} currentIndex={2} />);
    expect(screen.getAllByText('icon:checkmark')).toHaveLength(2);
  });

  it('marks every step done when complete', () => {
    render(<OrderStageStepper steps={steps} currentIndex={6} complete />);
    expect(screen.getAllByText('icon:checkmark')).toHaveLength(7);
    expect(screen.getByLabelText('Delivered, done')).toBeTruthy();
  });

  it('shows a problem icon on the current step', () => {
    render(<OrderStageStepper steps={steps} currentIndex={2} problem="danger" />);
    expect(screen.getByText('icon:close')).toBeTruthy();
  });

  it('renders nothing without steps', () => {
    render(<OrderStageStepper steps={[]} currentIndex={-1} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows step times in the vertical list', () => {
    render(<OrderStageStepper steps={steps} currentIndex={1} orientation="vertical" stepTimes={{ confirmed: '9:02 AM' }} />);
    expect(screen.getByText('9:02 AM')).toBeTruthy();
  });

  it('pulses the halo, and holds it still under reduced motion', async () => {
    const flat = () => StyleSheet.flatten(screen.getByTestId('step-halo').props.style) as { opacity?: unknown };
    const { unmount } = render(<OrderStageStepper steps={steps} currentIndex={1} />);
    await act(async () => {});
    expect(flat().opacity).toBeDefined();
    unmount();

    reduce.mockResolvedValue(true);
    render(<OrderStageStepper steps={steps} currentIndex={1} />);
    await act(async () => {});
    expect(flat().opacity).toBeUndefined();
  });
});

describe('OrderProgressHero', () => {
  const view = orderTrackingView({
    audience: 'buyer',
    order: { status: 'READY_FOR_PICKUP', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms' },
    delivery: { status: 'DRIVER_ASSIGNED', mode: 'COSTONOMY', driverName: 'Ravi', trackable: true },
    nowMs: 0,
  });

  it('reads the headline as a live header and offers Track in the partner phase', () => {
    const onTrack = jest.fn();
    render(<OrderProgressHero view={view} onTrack={onTrack} />);
    const header = screen.getByRole('header');
    expect(header.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Ravi is heading to the supplier')).toBeTruthy();
    expect(screen.getByText('Your order will be picked up shortly')).toBeTruthy();
    expect(screen.getByText('Step 3 of 5 · Partner')).toBeTruthy();
    expect(screen.getByLabelText('Track')).toBeTruthy();
  });
});

describe('OrderProgressHero tag (supplier order screen)', () => {
  it('shows a completed order\'s tag in sentence case, not upper-cased', () => {
    const completed = orderTrackingView({
      audience: 'supplier',
      order: { status: 'COMPLETED', deliveryMode: 'COSTONOMY_DELIVERY', restaurantName: 'Spice Garden' },
      delivery: { status: 'DELIVERED', mode: 'COSTONOMY', driverName: 'Ravi', trackable: false },
      nowMs: 0,
    });
    render(<OrderProgressHero view={completed} />);
    const tag = screen.getByText('Delivered', { exact: true });
    expect(screen.getByTestId('tag-delivered')).toBeTruthy();
    expect(StyleSheet.flatten(tag.props.style).textTransform).not.toBe('uppercase');
  });
});
