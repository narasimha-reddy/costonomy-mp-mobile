import React from 'react';
import { Platform } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { MandiMap } from '@/components/delivery/MandiMap';
import { markTilesFailed, markTilesLoaded, resetTileWatchdog, tilesFailed } from '@/lib/maps/tileWatchdog';

jest.mock('@/lib/maps/config', () => ({ MAPS_CONFIGURED: true }));
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  Polyline: 'Polyline',
  Circle: 'Circle',
  PROVIDER_DEFAULT: null,
}));

const fix = { latitude: '12.97', longitude: '77.59', bearing: null, recordedAt: '2026-01-01T10:00:00Z' };
const outlet = { latitude: 12.98, longitude: 77.6 };
const original = Platform.OS;
const setOS = (os: 'android' | 'ios') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

beforeEach(() => {
  jest.useFakeTimers();
  resetTileWatchdog();
  delete process.env.EXPO_PUBLIC_DELIVERY_MAP;
  setOS('android');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setOS(original as 'android' | 'ios');
  delete process.env.EXPO_PUBLIC_DELIVERY_MAP;
});

describe('tile watchdog (Android, with a key)', () => {
  it('no onMapLoaded in 6 s falls back to the sketch', () => {
    const { UNSAFE_queryByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    expect(UNSAFE_queryByType('MapView' as never)).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(5900);
    });
    expect(UNSAFE_queryByType('MapView' as never)).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(UNSAFE_queryByType('MapView' as never)).toBeNull();
    expect(screen.getByTestId('map-driver')).toBeTruthy();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[maps] tiles did not load'));
  });

  it('onMapLoaded keeps the map', () => {
    const { UNSAFE_getByType, UNSAFE_queryByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    act(() => {
      (UNSAFE_getByType('MapView' as never).props as { onMapLoaded: () => void }).onMapLoaded();
    });
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(UNSAFE_queryByType('MapView' as never)).not.toBeNull();
    expect(screen.queryByTestId('map-driver')).toBeNull();
  });

  it('EXPO_PUBLIC_DELIVERY_MAP=sketch forces the sketch', () => {
    process.env.EXPO_PUBLIC_DELIVERY_MAP = 'sketch';
    const { UNSAFE_queryByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    expect(UNSAFE_queryByType('MapView' as never)).toBeNull();
    expect(screen.getByTestId('map-driver')).toBeTruthy();
  });

  it('does not watch on iOS: the default provider is always real', () => {
    setOS('ios');
    const { UNSAFE_queryByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(UNSAFE_queryByType('MapView' as never)).not.toBeNull();
  });
});

describe('the session flag', () => {
  it('a timeout never marks the session failed once any map has drawn tiles', () => {
    markTilesLoaded();
    markTilesFailed('timeout');
    expect(tilesFailed()).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('a timeout before any map loaded still marks it (Android has no other signal)', () => {
    markTilesFailed('timeout');
    expect(tilesFailed()).toBe(true);
  });

  it('a refused key (auth) marks the session even after tiles loaded: it is definitive', () => {
    markTilesLoaded();
    markTilesFailed('auth');
    expect(tilesFailed()).toBe(true);
  });

  it('Android: a second map timing out after the first loaded falls back alone, later maps stay real', () => {
    const first = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    act(() => {
      (first.UNSAFE_getByType('MapView' as never).props as { onMapLoaded: () => void }).onMapLoaded();
    });
    const second = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    act(() => {
      jest.advanceTimersByTime(6100);
    });
    expect(second.UNSAFE_queryByType('MapView' as never)).toBeNull();
    expect(first.UNSAFE_queryByType('MapView' as never)).not.toBeNull();
    expect(tilesFailed()).toBe(false);
    const third = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    expect(third.UNSAFE_queryByType('MapView' as never)).not.toBeNull();
  });
});
