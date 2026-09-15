import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MandiMapProps } from './MandiMap';
import { MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * The web build of the delivery map.
 *
 * <p>`react-native-maps` has no web implementation, and the restaurant app is
 * checked in a browser. A placeholder saying "map unavailable" would make the
 * tracking screen unverifiable on the one platform it gets looked at on, so this
 * renders the same facts without the tiles: how far away the driver is, which
 * way they are heading, and — the part that actually matters — whether the
 * position is current.
 *
 * <p><b>A stale fix is labelled as stale.</b> Doc 06 §8: showing an old position
 * as if it were live is worse than showing none, because the restaurant plans
 * around it. That rule is about the data, not about the tiles, so it holds here
 * exactly as it does on a device.
 */
export function MandiMap({ driver, destination, stale, height = 220 }: MandiMapProps) {
  if (!driver && !destination) return null;

  const distanceKm =
    driver && destination
      ? haversineKm(
          Number(driver.latitude), Number(driver.longitude),
          destination.latitude, destination.longitude,
        )
      : null;

  return (
    <View style={[styles.panel, { minHeight: height }]}>
      <View style={styles.row}>
        <Ionicons
          name={stale ? 'cloud-offline-outline' : 'navigate'}
          size={20}
          color={stale ? Colors.textTertiary : Colors.primary}
        />
        <MandiText variant="bodyEmphasis">
          {driver
            ? stale ? 'Last known position' : 'Driver on the move'
            : 'Waiting for the driver'}
        </MandiText>
      </View>

      {distanceKm != null && (
        <MandiText variant="display" color={stale ? Colors.textTertiary : Colors.textPrimary}>
          {distanceKm < 1
            ? `${Math.round(distanceKm * 1000)} m`
            : `${distanceKm.toFixed(1)} km`}
        </MandiText>
      )}
      {distanceKm != null && (
        <MandiText variant="caption" color={Colors.textSecondary}>
          straight-line distance from your outlet
        </MandiText>
      )}

      {driver && (
        <MandiText variant="caption" color={Colors.textTertiary}>
          {Number(driver.latitude).toFixed(4)}, {Number(driver.longitude).toFixed(4)}
          {driver.bearing != null && ` · heading ${compass(Number(driver.bearing))}`}
        </MandiText>
      )}

      <MandiText variant="caption" color={Colors.textTertiary}>
        The map itself renders on the phone; this is the web view of the same data.
      </MandiText>
    </View>
  );
}

/** Great-circle distance in km. Display only — nothing decides anything on it. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const COMPASS = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
] as const;

function compass(bearing: number): string {
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % COMPASS.length;
  return COMPASS[index] ?? 'north';
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.xs,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
