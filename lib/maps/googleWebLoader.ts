/**
 * Loads the Google Maps JavaScript API for the delivery map, once, with the web key.
 *
 * <p>The key is `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY`, or `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` only when that is absent
 * or empty. Expo inlines `process.env.EXPO_PUBLIC_*` only when written out literally, so both are spelled out.
 * The key is never logged. The script is injected once for the page (the promise is the cache).
 */
export function webMapsKey(): string {
  const web = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? '').trim();
  if (web) return web;
  return (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
}

let pending: Promise<void> | null = null;

/** Test seam. */
export function resetWebMapsLoader(): void {
  pending = null;
}

export function loadWebMaps(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps is web only'));
  }
  if ((window as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve();
  if (pending) return pending;
  const key = webMapsKey();
  if (!key) return Promise.reject(new Error('No Google Maps web key'));

  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    // Synchronous bootstrap (no loading=async): classes exist when onload fires.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      pending = null;
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
