/**
 * The Google Maps browser key.
 *
 * <p><b>Public by necessity, restricted by configuration.</b> A map that renders
 * tiles in a browser needs a key the browser can read — there is no arrangement
 * where this one stays secret. What keeps it safe is the restriction, not the
 * hiding: in Google Cloud, limit it to the Maps JavaScript API and the Places
 * API, and to your own HTTP referrers and bundle ids. An unrestricted key is a
 * bill somebody else can run up.
 *
 * <p>Keep any key used for server-side geocoding separate and secret. Sharing one
 * key between the browser and the backend makes the backend's key public too.
 *
 * <p>Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env`; Expo reads it at build time.
 */
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

/** Whether a map can render at all. Every picker checks this before mounting. */
export const MAPS_CONFIGURED = GOOGLE_MAPS_API_KEY.trim().length > 0;

/**
 * Where a map opens when nothing is pinned yet.
 *
 * <p>Bengaluru, because that is where this marketplace is. A world view centred
 * on the Atlantic costs ten seconds of panning before anyone can begin.
 */
export const DEFAULT_CENTER = { latitude: 12.9716, longitude: 77.5946 };

/** Close enough to see a street, far enough to recognise the neighbourhood. */
export const DEFAULT_ZOOM = 15;

/** What a picker hands back once someone has chosen a spot. */
export interface PickedPlace {
  latitude: string;
  longitude: string;
  /** Google's id for the place, when it came from search rather than a drag. */
  placeId?: string | null;
  /** The address Google reads back for these coordinates. */
  formattedAddress?: string | null;
}
