import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

export interface Coordinates {
  latitude: string;
  longitude: string;
}

type State = 'idle' | 'asking' | 'ready' | 'denied' | 'unavailable';

/**
 * The device's coordinates, asked for once.
 *
 * <p><b>Why this matters more than it looks.</b> Delivery quoting is a real
 * serviceability check against the distance between a store and an outlet. An
 * outlet with no coordinates can never be quoted for, so its orders stop dead at
 * READY_FOR_PICKUP with no error anywhere — this build hit exactly that. Asking
 * at registration is the one moment the person is standing in the place they are
 * describing.
 *
 * <p>Permission is requested at the moment it is used, never on launch, and a
 * refusal is a supported outcome: the form still submits, and the address is
 * enough for a human to find. It is the quoting that suffers, so the screen says
 * so rather than blocking.
 */
export function useDeviceLocation() {
  const [state, setState] = useState<State>('idle');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);

  const capture = useCallback(async () => {
    setState('asking');
    try {
      if (Platform.OS === 'web') {
        const position = await webPosition();
        setCoordinates(position);
        setState(position ? 'ready' : 'denied');
        return;
      }

      // Imported lazily so the web bundle never pulls the native module in.
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setCoordinates({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      });
      setState('ready');
    } catch {
      // No hardware, no permission dialog, a timeout — all the same to the form.
      setState('unavailable');
    }
  }, []);

  const clear = useCallback(() => {
    setCoordinates(null);
    setState('idle');
  }, []);

  return { state, coordinates, capture, clear };
}

function webPosition(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      }),
      () => resolve(null),
      { timeout: 10_000 },
    );
  });
}
