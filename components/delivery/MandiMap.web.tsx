/**
 * The web build of the delivery map: `react-native-maps` has no web implementation. With a Google Maps web key
 * (EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY, see docs/GOOGLE_MAPS.md) it is the real Google map; without one, or if Google
 * refuses the key, it is the schematic, which is also what native shows without a key.
 */
import React from 'react';
import { webMapsKey } from '@/lib/maps/googleWebLoader';
import { GoogleTrackMap } from './GoogleTrackMap.web';
import { MandiMapSketch, type MandiMapProps } from './MandiMapSketch';

export type { MandiMapProps };

export function MandiMap(props: MandiMapProps) {
  if (!webMapsKey() || process.env.EXPO_PUBLIC_DELIVERY_MAP === 'sketch') return <MandiMapSketch {...props} />;
  return <GoogleTrackMap {...props} />;
}
