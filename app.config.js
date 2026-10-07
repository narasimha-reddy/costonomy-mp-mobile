/**
 * Dynamic Expo config layered over app.json.
 *
 * Puts the Google Maps key into the Android manifest (com.google.android.geo.API_KEY) at build time, from the same
 * EXPO_PUBLIC_GOOGLE_MAPS_API_KEY that feeds the web map. The key is never written to a committed file; with no key
 * the config is returned untouched and the native map falls back to the schematic (see docs/GOOGLE_MAPS.md).
 */
module.exports = ({ config }) => {
  const key = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
  if (!key) return config;
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { ...config.android?.config?.googleMaps, apiKey: key },
      },
    },
  };
};
