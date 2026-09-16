import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Coordinates } from '@/hooks/useDeviceLocation';
import { MandiButton } from './MandiButton';
import { MandiText } from './MandiText';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Pin this place on the map.
 *
 * <p>Optional by design, and the copy says what is lost rather than insisting.
 * Without coordinates an outlet cannot be quoted for delivery — which is a real
 * consequence, and a better argument than a required-field asterisk.
 */
export function MandiLocationField({
  state,
  coordinates,
  onCapture,
  subject,
}: {
  state: 'idle' | 'asking' | 'ready' | 'denied' | 'unavailable';
  coordinates: Coordinates | null;
  onCapture: () => void;
  /** "outlet" or "store" — this component serves both registrations. */
  subject: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Ionicons
          name={state === 'ready' ? 'location' : 'location-outline'}
          size={20}
          color={state === 'ready' ? Colors.success : Colors.textSecondary}
        />
        <View style={styles.text}>
          <MandiText variant="bodyEmphasis">
            {state === 'ready' ? 'Location pinned' : `Pin this ${subject} on the map`}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {message(state, coordinates, subject)}
          </MandiText>
        </View>
      </View>

      {state !== 'ready' && (
        <MandiButton
          label={state === 'idle' ? 'Use my current location' : 'Try again'}
          variant="secondary"
          size="md"
          loading={state === 'asking'}
          onPress={onCapture}
        />
      )}
    </View>
  );
}

function message(state: string, coordinates: Coordinates | null, subject: string): string {
  switch (state) {
    case 'ready':
      return coordinates ? `${coordinates.latitude}, ${coordinates.longitude}` : '';
    case 'asking':
      return 'Asking your device…';
    case 'denied':
      return `Location was declined. You can still continue — but we cannot quote delivery to this ${subject} until it is pinned.`;
    case 'unavailable':
      return `We could not read a location here. You can still continue and pin the ${subject} later.`;
    default:
      return `Suppliers quote delivery by distance, so an unpinned ${subject} cannot be quoted for.`;
  }
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  text: { flex: 1, gap: Spacing.xs },
});
