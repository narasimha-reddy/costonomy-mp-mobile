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
 * Set `EXPO_PUBLIC_API_URL` in .env.local to point anywhere else (see .env.example); it is read at build time by
 * Expo. `npm run start:test` / `start:prod` set `EXPO_PUBLIC_API_URL_OVERRIDE` for one run instead: the Expo dev
 * server lets .env files overwrite the shell's values for names they define, so the scripts use names no .env file has.
 */
/** The API's local port. Matches `server.port` in the API's application.properties. */
const DEFAULT_PORT = 7070;
const CONTEXT_PATH = '/costonomy-mp-api';

function defaultHost(port = DEFAULT_PORT): string {
  if (Platform.OS === 'android') {
    // The Android emulator's alias for the host machine.
    return `http://10.0.2.2:${port}`;
  }
  if (Platform.OS === 'ios') {
    // The iOS simulator shares the host's network stack, so localhost is the host.
    return `http://localhost:${port}`;
  }
  return `http://localhost:${port}`;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL_OVERRIDE ?? process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL: string =
  API_URL?.replace(/\/$/, '') ?? `${defaultHost()}${CONTEXT_PATH}`;

/**
 * costonomy-common-api: sign-in, sessions and the business, outlet and team records the marketplace shares with
 * Costonomy's other apps. Locally it is the Docker stack's, on 8082; `EXPO_PUBLIC_COMMON_API_URL` points anywhere else.
 */
export const COMMON_API_BASE_URL: string =
  (process.env.EXPO_PUBLIC_COMMON_API_URL_OVERRIDE ?? process.env.EXPO_PUBLIC_COMMON_API_URL)?.replace(/\/$/, '')
  ?? `${defaultHost(8082)}/costonomy-common-api`;

/** This app's client in costonomy-common-api: phone + code sign-in, rotating refresh tokens. */
export const COMMON_CLIENT_ID = 'mp-mobile';

/** Shown on the sign-in screen in development, so a misconfigured host is obvious. */
export const API_ENVIRONMENT_LABEL: string =
  API_URL ? 'custom' : `${Platform.OS} default`;

export const APP_VERSION: string =
  Constants.expoConfig?.version ?? '0.1.0';
