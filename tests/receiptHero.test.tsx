import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReceiptHero } from '@/components/delivery/ReceiptHero';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

type TestNode = { props: Record<string, unknown> };

describe('ReceiptHero', () => {
  it('receipt renders the zigzag path', () => {
    render(<ReceiptHero title="Order delivered at Kitchen" subtitle="Delivered at 7:34 PM" />);
    const zig = screen.UNSAFE_root.findAll((n: TestNode) => n.props?.testID === 'receipt-zigzag' && typeof n.props?.d === 'string')[0];
    expect(zig).toBeTruthy();
    const d = zig.props.d as string;
    expect(d.startsWith('M0')).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBeGreaterThan(10);
    expect(zig.props.fill).toBe(Colors.surface);
  });

  it('shows the title and subtitle, and omits a null subtitle', () => {
    const { rerender } = render(<ReceiptHero title="Order delivered at Kitchen" subtitle="Delivered at 7:34 PM" />);
    expect(screen.getByText('Order delivered at Kitchen')).toBeTruthy();
    expect(screen.getByText('Delivered at 7:34 PM')).toBeTruthy();
    rerender(<ReceiptHero title="Order delivered at Kitchen" subtitle={null} />);
    expect(screen.queryByText('Delivered at 7:34 PM')).toBeNull();
  });
});
