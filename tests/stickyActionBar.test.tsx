import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StickyActionBar } from '@/components/common/StickyActionBar';
import { Spacing } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

const payProps = {
  variant: 'pay' as const,
  left: { eyebrow: 'PAY USING', label: 'Mandi Credit', onPress: jest.fn() },
  amount: '₹1,250.00',
  amountCaption: 'TOTAL',
  ctaLabel: 'Place order',
};

describe('StickyActionBar', () => {
  it('pay variant shows eyebrow, label, amount, CTA', () => {
    const onPress = jest.fn();
    render(<StickyActionBar {...payProps} onPress={onPress} />);
    expect(screen.getByText('PAY USING')).toBeTruthy();
    expect(screen.getByText('Mandi Credit')).toBeTruthy();
    expect(screen.getByText('₹1,250.00')).toBeTruthy();
    expect(screen.getByText('TOTAL')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Place order'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('left column press opens the method picker', () => {
    const open = jest.fn();
    render(<StickyActionBar {...payProps} left={{ ...payProps.left, onPress: open }} onPress={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('PAY USING, Mandi Credit'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('continue variant is a full-width bar with label and CTA', () => {
    const onPress = jest.fn();
    render(
      <StickyActionBar
        variant="continue"
        left={{ eyebrow: '', label: '3 items added' }}
        ctaLabel="Continue ›"
        onPress={onPress}
      />,
    );
    expect(screen.getByText('3 items added')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Continue ›'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('loading disables press', () => {
    const onPress = jest.fn();
    render(<StickyActionBar {...payProps} loading onPress={onPress} />);
    const cta = screen.getByLabelText('Place order');
    fireEvent.press(cta);
    expect(onPress).not.toHaveBeenCalled();
    expect(cta.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });

  it('disabled also blocks press', () => {
    const onPress = jest.fn();
    render(<StickyActionBar {...payProps} disabled onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Place order'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('bottom padding includes the safe-area inset', () => {
    const { UNSAFE_getAllByType } = render(<StickyActionBar {...payProps} onPress={jest.fn()} />);
    const paddings = UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style)?.paddingBottom);
    expect(paddings).toContain(Spacing.md + 34);
  });
});
