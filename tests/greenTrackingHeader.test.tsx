import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GreenTrackingHeader } from '@/components/delivery/GreenTrackingHeader';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});

const base = {
  supplierLine: 'Fresh Mandi Traders',
  title: 'Arriving in 12 mins',
  pill: { text: 'Arriving by 4:20 pm', tone: 'normal' as const },
  tone: 'live' as const,
  insetTop: 24,
  onBack: () => {},
};

const rootStyle = () => StyleSheet.flatten(screen.getByTestId('tracking-header').props.style);

describe('GreenTrackingHeader', () => {
  it('title is a header with a polite live region', () => {
    render(<GreenTrackingHeader {...base} />);
    const title = screen.getByText('Arriving in 12 mins');
    expect(title.props.accessibilityRole).toBe('header');
    expect(title.props.accessibilityLiveRegion).toBe('polite');
    expect(title.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(title.props.style).textAlign).toBe('center');
    expect(StyleSheet.flatten(title.props.style).color).toBe(Colors.onTrackHeader);
  });

  it('draws green under the status bar on live', () => {
    render(<GreenTrackingHeader {...base} />);
    expect(rootStyle().backgroundColor).toBe(Colors.trackHeader);
    expect(rootStyle().paddingTop).toBe(24);
    expect(screen.getByText('Fresh Mandi Traders').props.numberOfLines).toBe(1);
  });

  it('neutral tone renders a white bar', () => {
    render(<GreenTrackingHeader {...base} tone="neutral" title="Order cancelled" pill={null} supplierLine={null} />);
    expect(rootStyle().backgroundColor).toBe(Colors.surface);
    expect(StyleSheet.flatten(screen.getByText('Order cancelled').props.style).color).toBe(Colors.textPrimary);
    expect(screen.queryByTestId('eta-pill')).toBeNull();
  });

  it('shows the pill with its stale subText and back calls onBack', () => {
    const onBack = jest.fn();
    render(<GreenTrackingHeader {...base} onBack={onBack} pill={{ text: 'Soon', subText: 'Updated 3 min ago', tone: 'normal' }} />);
    expect(screen.getByText('Updated 3 min ago')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('refresh shows spinner and calls onRefresh', () => {
    const onRefresh = jest.fn();
    const { rerender } = render(<GreenTrackingHeader {...base} onRefresh={onRefresh} />);
    fireEvent.press(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('eta-pill-spinner')).toBeNull();
    rerender(<GreenTrackingHeader {...base} onRefresh={onRefresh} refreshing />);
    expect(screen.getByTestId('eta-pill-spinner')).toBeTruthy();
  });

  it('right slot renders', () => {
    render(<GreenTrackingHeader {...base} right={<Text>Help</Text>} />);
    expect(screen.getByText('Help')).toBeTruthy();
  });
});
