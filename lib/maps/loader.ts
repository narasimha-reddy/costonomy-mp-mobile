import { GOOGLE_MAPS_API_KEY } from './config';

/**
 * Loads the Google Maps JavaScript API, once.
 *
 * <p>Web only. The SDK is a script tag, not an npm package, and it must not be
 * added twice: a second load throws, and a second copy of the library means two
 * incompatible `google.maps` namespaces where markers made by one cannot be added
 * to a map made by the other.
 *
 * <p>The promise is cached rather than the boolean, so two components mounting in
 * the same frame wait on one load instead of racing to start two.
 */
let pending: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps is web only'));
  }
  if ((window as { google?: { maps?: unknown } }).google?.maps) {
    return Promise.resolve();
  }
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    // `places` for the search box.
    //
    // Deliberately *not* `loading=async`: that bootstrap resolves with a stub
    // where `google.maps.Map` does not exist until `importLibrary` has been
    // awaited, so `new google.maps.Map(...)` throws "is not a constructor" — a
    // failure that looks exactly like a bad API key and is not one. The
    // synchronous load defines the classes by the time `onload` fires, which is
    // the contract the rest of this file assumes.
    script.src = 'https://maps.googleapis.com/maps/api/js'
      + `?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`
      + '&libraries=places&v=weekly';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever: the
      // usual cause is a network blip or a key that was just restricted.
      pending = null;
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return pending;
}
