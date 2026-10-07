import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { MAPS_CONFIGURED } from '@/lib/maps/config';
import { MandiMapSketch, type MandiMapProps } from './MandiMapSketch';
import { Colors, Radius } from '@/theme';

export type { MandiMapProps };

/**
 * The delivery map. Doc 05 §16.
 *
 * <p>Native only — `MandiMap.web.tsx` is the web build, and it is a real view of
 * the same data rather than a placeholder, because the whole restaurant app is
 * checked in a browser.
 *
 * <p>Google's MapView draws nothing without a Maps SDK key in the Android manifest,
 * so with no key configured (`MAPS_CONFIGURED` false) this shows the same schematic
 * as the web build instead of a blank panel.
 *
 * <p><b>A stale position is drawn differently, never drawn as current.</b> Doc 06
 * §8: an old fix shown as if it were live is worse than no fix, because the
 * restaurant plans around it.
 */
export function MandiMap({ driver, destination, stale, height = 220, bare = false }: MandiMapProps) {
  const focus = driver
    ? { latitude: Number(driver.latitude), longitude: Number(driver.longitude) }
    : destination;

  if (!focus) return null;
  if (!MAPS_CONFIGURED) {
    return <MandiMapSketch driver={driver} destination={destination} stale={stale} height={height} bare={bare} />;
  }

  return (
    <View style={[styles.container, bare && styles.bare, { height }]}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        region={{ ...focus, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        pointerEvents="none"
      >
        {driver && (
          <Marker
            coordinate={{ latitude: Number(driver.latitude), longitude: Number(driver.longitude) }}
            title={stale ? 'Last known position' : 'Driver'}
            pinColor={stale ? Colors.textTertiary : Colors.primary}
            opacity={stale ? 0.6 : 1}
          />
        )}
        {destination && (
          <Marker coordinate={destination} title="Your outlet" pinColor={Colors.success} />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSunken,
  },
  bare: { borderRadius: 0 },
});
