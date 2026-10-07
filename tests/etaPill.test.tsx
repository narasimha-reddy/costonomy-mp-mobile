import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EtaPill } from '@/components/delivery/EtaPill';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});

describe('EtaPill', () => {
  it('pill is one line', () => {
    render(<EtaPill text="Arriving at 4:20 pm, a very long text that must not wrap" tone="normal" on="green" />);
    const text = screen.getByText(/Arriving at 4:20 pm/);
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBe('tail');
  });

  it('stale subText shows Updated N min ago', () => {
    render(<EtaPill text="Arriving in 12 mins" subText="Updated 3 min ago" tone="normal" on="green" />);
    const sub = screen.getByText('Updated 3 min ago');
    expect(sub.props.numberOfLines).toBe(1);
    expect(screen.getByLabelText('Arriving in 12 mins, Updated 3 min ago')).toBeTruthy();
  });

  it('refresh shows spinner and calls onRefresh', () => {
    const onRefresh = jest.fn();
    const { rerender } = render(<EtaPill text="Soon" tone="normal" on="green" onRefresh={onRefresh} />);
    expect(screen.queryByTestId('eta-pill-spinner')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender(<EtaPill text="Soon" tone="normal" on="green" onRefresh={onRefresh} refreshing />);
    expect(screen.getByTestId('eta-pill-spinner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' }).props.accessibilityState).toMatchObject({ busy: true });
    // The refresh button reaches 44dp by hit slop (28 + 2 x 8).
    expect(screen.getByRole('button', { name: 'Refresh' }).props.hitSlop).toBeGreaterThanOrEqual(8);
  });

  it('uses the dark green pill on green and a neutral pill on white', () => {
    const { rerender } = render(<EtaPill text="Soon" tone="normal" on="green" />);
    const bg = () => StyleSheet.flatten(screen.getByTestId('eta-pill').props.style).backgroundColor;
    expect(bg()).toBe(Colors.trackHeaderPill);
    rerender(<EtaPill text="Soon" tone="normal" on="white" />);
    expect(bg()).toBe(Colors.background);
    rerender(<EtaPill text="Soon" tone="warning" on="green" />);
    expect(bg()).toBe(Colors.warningBanner);
  });
});
