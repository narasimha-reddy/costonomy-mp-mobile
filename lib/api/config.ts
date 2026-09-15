import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the API lives.
 *
 * <p>The default differs by platform because "localhost" means different things
 * on each. On web it is the developer's machine. On an Android emulator the
 * device's own loopback is not the host's, so `10.0.2.2` is the documented
 * escape hatch. On a physical phone neither works and the machine's LAN address
 * has to be supplied — hence the override.
 *
 * Set `EXPO_PUBLIC_API_URL` to point anywhere else; it is read at build time by
 * Expo and is the only thing that needs changing to run against a deployed
 * backend.
 */
const DEFAULT_PORT = 8080;
const CONTEXT_PATH = '/costonomy-mp-api';

function defaultHost(): string {
  if (Platform.OS === 'android') {
    // The Android emulator's alias for the host machine.
    return `http://10.0.2.2:${DEFAULT_PORT}`;
  }
  if (Platform.OS === 'ios') {
    // The iOS simulator shares the host's network stack, so localhost is the host.
    return `http://localhost:${DEFAULT_PORT}`;
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? `${defaultHost()}${CONTEXT_PATH}`;

/** Shown on the sign-in screen in development, so a misconfigured host is obvious. */
export const API_ENVIRONMENT_LABEL: string =
  process.env.EXPO_PUBLIC_API_URL ? 'custom' : `${Platform.OS} default`;

export const APP_VERSION: string =
  Constants.expoConfig?.version ?? '0.1.0';
