import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small, non-secret device preferences — the selected outlet, recent searches.
 *
 * <p>Deliberately separate from `lib/session/storage`, which is SecureStore and
 * holds tokens. Keychain writes are slow and are audited as credential storage;
 * putting "which outlet was I looking at" in there both costs more than it should
 * and muddies what is actually a secret.
 *
 * <p>Every accessor swallows failure and returns null. Storage genuinely is
 * unavailable sometimes — a cleared profile, a private browser window, a web
 * viewer with site data blocked — and a remembered preference is never worth a
 * crash on launch.
 */
export async function getPreference(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setPreference(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // A preference that will not persist is not an error worth surfacing.
  }
}

export async function removePreference(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // As above.
  }
}

export async function getJsonPreference<T>(key: string, fallback: T): Promise<T> {
  const raw = await getPreference(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Written by an older version with a different shape, or truncated.
    return fallback;
  }
}

export async function setJsonPreference(key: string, value: unknown): Promise<void> {
  await setPreference(key, JSON.stringify(value));
}
