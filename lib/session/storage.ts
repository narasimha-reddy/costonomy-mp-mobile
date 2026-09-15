import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the session tokens live.
 *
 * <p><b>`expo-secure-store` does not exist on web</b>, and the web target is how
 * this app is developed day to day. So storage is abstracted, with the honest
 * caveat that the two are not equally safe:
 *
 * - **Native** — Keychain / EncryptedSharedPreferences. Encrypted at rest and
 *   readable only by this app.
 * - **Web** — `localStorage`. Readable by any script on the origin, and not
 *   encrypted. That is acceptable for local development and would not be
 *   acceptable for a deployed web build; if this app is ever shipped to browsers,
 *   the refresh token belongs in an httpOnly cookie instead.
 *
 * Stated here rather than discovered later, because the difference is invisible
 * at the call site — which is exactly what makes it worth writing down.
 */

const AVAILABLE_ON_WEB = typeof globalThis !== 'undefined' && 'localStorage' in globalThis;

export async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (AVAILABLE_ON_WEB) globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AVAILABLE_ON_WEB ? globalThis.localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (AVAILABLE_ON_WEB) globalThis.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
