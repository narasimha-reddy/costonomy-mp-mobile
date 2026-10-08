import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DeviceFrame, DEVICE_WIDTH, SUPPLIER_WIDE_WIDTH } from '@/components/common/DeviceFrame';

let mockPath = '/supplier';
let mockWidth = 1280;
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}));

const maxWidth = () => StyleSheet.flatten(screen.getByTestId('device-frame').props.style).maxWidth;

describe('DeviceFrame width', () => {
  const original = Platform.OS;
  beforeEach(() => { Platform.OS = 'web'; mockWidth = 1280; });
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
});
