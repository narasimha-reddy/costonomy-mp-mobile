import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from './MandiText';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * What a map looks like when it cannot be shown.
 *
 * <p><b>The setting's name is not on the screen.</b> A store owner has no use for
 * an environment variable; the detail a developer needs goes to the console. The
 * person holding the phone is told why there is no map, what still works, and is
 * shown the address they are pinning so the empty box is not the only thing there.
 */
export function MapUnavailable({ height, address }: { height: number; address?: string | null }) {
  const line = (address ?? '').trim();
  return (
    <View style={[styles.missing, { minHeight: height }]}>
      <Ionicons name="map-outline" size={24} color={Colors.textTertiary} />
      <MandiText variant="bodyEmphasis">Map unavailable</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary} center>
        Maps are not set up in this version of the app, so the map and place search cannot be shown. Your address
        is saved as normal. You can still pin the place with the buttons below.
      </MandiText>
      {line !== '' ? (
        <MandiText variant="caption" color={Colors.textPrimary} center>{line}</MandiText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  missing: {
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
});
