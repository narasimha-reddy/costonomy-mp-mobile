import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import type { DeliveryLocation } from '@/models/delivery';
import { Colors, Radius } from '@/theme';

export interface MandiMapProps {
  /** The driver's last known fix, or null when there is none yet. */
  driver: DeliveryLocation | null;
  /** Where it is going. */
  destination: { latitude: number; longitude: number } | null;
  /** True when the newest fix is older than the freshness threshold (doc 06 §8). */
  stale: boolean;
  height?: number;
}

/**
 * The delivery map. Doc 05 §16.
 *
 * <p>Native only — `MandiMap.web.tsx` is the web build, and it is a real view of
 * the same data rather than a placeholder, because the whole restaurant app is
 * checked in a browser.
 *
 * <p><b>A stale position is drawn differently, never drawn as current.</b> Doc 06
 * §8: an old fix shown as if it were live is worse than no fix, because the
 * restaurant plans around it.
 */
export function MandiMap({ driver, destination, stale, height = 220 }: MandiMapProps) {
  const focus = driver
    ? { latitude: Number(driver.latitude), longitude: Number(driver.longitude) }
    : destination;

  if (!focus) return null;

  return (
    <View style={[styles.container, { height }]}>
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
});
