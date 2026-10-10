import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { MandiMapPicker } from '@/components/common/MandiMapPicker.web';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@/lib/maps/config', () => ({
  MAPS_CONFIGURED: true, GOOGLE_MAPS_API_KEY: 'k', DEFAULT_CENTER: { latitude: 1, longitude: 2 }, DEFAULT_ZOOM: 15,
}));
const mockLoad = jest.fn();
jest.mock('@/lib/maps/loader', () => ({ loadGoogleMaps: () => mockLoad() }));

type Obj = Record<string, any>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  jest.resetAllMocks();
  delete (window as Obj).gm_authFailure;
  (window as Obj).google = undefined;
});

describe('map picker when Google refuses to draw', () => {
  it('shows MapUnavailable with the address when Google reports an auth failure', async () => {
    mockLoad.mockResolvedValue(undefined);
    render(<MandiMapPicker value={null} onChange={jest.fn()} address="1 Road, Pune" />);
    await flush();
    expect(screen.queryByText('Map unavailable')).toBeNull();
    expect(typeof (window as Obj).gm_authFailure).toBe('function');
    act(() => (window as Obj).gm_authFailure());
    expect(screen.getByText('Map unavailable')).toBeTruthy();
    expect(screen.getByText('1 Road, Pune')).toBeTruthy();
    // The cause is not "not set up": the key exists and was refused.
    expect(screen.queryByText(/not set up in this version/)).toBeNull();
  });

  it('shows MapUnavailable when the script fails to load', async () => {
    mockLoad.mockRejectedValue(new Error('Could not load Google Maps'));
    render(<MandiMapPicker value={null} onChange={jest.fn()} address="1 Road, Pune" />);
    await flush();
    expect(screen.getByText('Map unavailable')).toBeTruthy();
    expect(screen.getByText('1 Road, Pune')).toBeTruthy();
  });

  it('keeps an earlier hook installed on the page working', async () => {
    const earlier = jest.fn();
    (window as Obj).gm_authFailure = earlier;
    mockLoad.mockResolvedValue(undefined);
    render(<MandiMapPicker value={null} onChange={jest.fn()} />);
    await flush();
    act(() => (window as Obj).gm_authFailure());
    expect(earlier).toHaveBeenCalledTimes(1);
  });
});
