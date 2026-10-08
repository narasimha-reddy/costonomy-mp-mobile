import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DeviceFrame, DEVICE_WIDTH, SUPPLIER_WIDE_WIDTH, resetFrameSide } from '@/components/common/DeviceFrame';
import { MandiBottomSheet } from '@/components/common/MandiBottomSheet';

let mockPath = '/supplier';
let mockWidth = 1280;
let mockAudience: string | null = 'SUPPLIER';
jest.mock('@/contexts/SessionProvider', () => ({
  useOptionalSession: () => (mockAudience == null ? null : { audience: mockAudience }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}));

const maxWidth = () => StyleSheet.flatten(screen.getByTestId('device-frame').props.style).maxWidth;

describe('DeviceFrame width', () => {
  const original = Platform.OS;
  beforeEach(() => { Platform.OS = 'web'; mockWidth = 1280; mockAudience = 'SUPPLIER'; resetFrameSide(); });
  afterEach(() => { Platform.OS = original; });

  it('renders at 1280 with /supplier gets 560', () => {
    mockPath = '/supplier/orders/5';
    render(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(SUPPLIER_WIDE_WIDTH);
    expect(SUPPLIER_WIDE_WIDTH).toBe(560);
  });

  it('restaurant routes stay at 390 on a wide screen', () => {
    mockPath = '/restaurant/cart';
    render(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(DEVICE_WIDTH);
  });

  it('supplier on a narrower viewport keeps 390', () => {
    mockPath = '/supplier';
    mockWidth = 800;
    render(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(DEVICE_WIDTH);
  });

  it('native is a pass-through', () => {
    Platform.OS = 'ios';
    render(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(screen.queryByTestId('device-frame')).toBeNull();
  });

  it('a supplier opening /chat or /notifications keeps the wide column', () => {
    for (const path of ['/chat', '/notifications']) {
      mockPath = path;
      const view = render(<DeviceFrame><Text>x</Text></DeviceFrame>);
      expect(maxWidth()).toBe(SUPPLIER_WIDE_WIDTH);
      view.unmount();
    }
  });

  it('a restaurant on /chat stays at 390', () => {
    mockAudience = 'RESTAURANT';
    mockPath = '/chat';
    render(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(DEVICE_WIDTH);
  });

  it('a user with both roles keeps the side they came from when they open /chat', () => {
    mockAudience = 'BOTH';
    mockPath = '/supplier/orders';
    const view = render(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(SUPPLIER_WIDE_WIDTH);
    mockPath = '/chat';
    view.rerender(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(SUPPLIER_WIDE_WIDTH);
    mockPath = '/restaurant';
    view.rerender(<DeviceFrame><Text>x</Text></DeviceFrame>);
    mockPath = '/notifications';
    view.rerender(<DeviceFrame><Text>x</Text></DeviceFrame>);
    expect(maxWidth()).toBe(DEVICE_WIDTH);
  });

  it('the bottom sheet column uses the same width as the frame it sits in', () => {
    const sheet = () => (
      <DeviceFrame>
        <MandiBottomSheet visible onClose={() => {}} avoidKeyboard testID="s"><Text>x</Text></MandiBottomSheet>
      </DeviceFrame>
    );
    const sheetWidth = () => StyleSheet.flatten(screen.getByTestId('s-keyboard-avoiding').props.style).maxWidth;
    mockPath = '/supplier/orders/5';
    const view = render(sheet());
    expect(sheetWidth()).toBe(SUPPLIER_WIDE_WIDTH);
    view.unmount();
    mockPath = '/restaurant/cart';
    render(sheet());
    expect(sheetWidth()).toBe(DEVICE_WIDTH);
  });

  it('a supplier opening a sheet over /chat gets the wide sheet', () => {
    mockPath = '/chat';
    render(
      <DeviceFrame>
        <MandiBottomSheet visible onClose={() => {}} avoidKeyboard testID="s"><Text>x</Text></MandiBottomSheet>
      </DeviceFrame>,
    );
    expect(StyleSheet.flatten(screen.getByTestId('s-keyboard-avoiding').props.style).maxWidth).toBe(SUPPLIER_WIDE_WIDTH);
  });
});
