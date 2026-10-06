import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { MandiMap } from '@/components/delivery/MandiMap';
import type { Delivery } from '@/models/delivery';
import { Colors, IconSize, MapHeight, Radius, Spacing } from '@/theme';

/**
 * The live map at the top of the tracking screen, with its honesty rows.
 *
 * <p>A stale fix keeps the map, with a marker that does not move, and says how old it is; nothing is interpolated.
 * With no fix yet there is no map, only a line saying the partner's position has not arrived.
 */
export function LiveMapHeader({
  delivery, destination, height = MapHeight.full,
}: {
  delivery: Pick<Delivery, 'location' | 'locationStale' | 'locationAgeSeconds'>;
  destination: { latitude: number; longitude: number } | null;
  height?: number;
}) {
  if (delivery.location == null) {
    return (
      <View style={styles.row}>
        <Ionicons name="locate-outline" size={IconSize.md} color={Colors.textSecondary} />
        <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>
          {'Waiting for the partner\'s location'}
        </MandiText>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <MandiMap driver={delivery.location} destination={destination} stale={delivery.locationStale} height={height} />
      {delivery.locationStale && (
        <View style={styles.row}>
          <Ionicons name="alert-circle-outline" size={IconSize.sm} color={Colors.warning} />
          <MandiText variant="caption" color={Colors.warning} style={styles.flex}>
            {delivery.locationAgeSeconds != null
              ? `Last update ${Math.max(1, Math.round(delivery.locationAgeSeconds / 60))} min ago. The partner may have moved since.`
              : 'This position may be out of date.'}
          </MandiText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
  },
  flex: { flex: 1 },
});
