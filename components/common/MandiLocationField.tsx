import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Coordinates } from '@/hooks/useDeviceLocation';
import { MandiButton } from './MandiButton';
import { MandiFormField } from './MandiFormField';
import { MandiMapPicker } from './MandiMapPicker';
import { MandiText } from './MandiText';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Pin this place on the map.
 *
 * <p>Optional by design, and the copy says what is lost rather than insisting.
 * Without coordinates a place cannot be quoted for delivery — which is a real
 * consequence, and a better argument than a required-field asterisk.
 *
 * <p><b>A pinned location stays changeable.</b> The capture button used to vanish
 * once coordinates existed, on the reasoning that the job was done — so a store
 * that moved, or was pinned from the wrong place, could never be corrected. At
 * registration that was merely unhelpful; on a settings screen it is the whole
 * point of the screen.
 *
 * <p><b>"Use my current location" is the wrong tool half the time.</b> Someone
 * editing store settings is usually not standing in the store, and a device fix
 * would then confidently pin their sofa. So there are three ways in — the map,
 * the device, and typed coordinates — and all three set one value.
 *
 * <p>The map is shown when this is an editor and a key is configured. Without a
 * key it says which key is missing rather than rendering an empty grey box, and
 * the other two ways still work: a supplier is never blocked by our configuration.
 */
export function MandiLocationField({
  state,
  coordinates,
  onCapture,
  subject,
  onCoordinatesChange,
}: {
  state: 'idle' | 'asking' | 'ready' | 'denied' | 'unavailable';
  coordinates: Coordinates | null;
  onCapture: () => void;
  /** "outlet" or "store" — this component serves both registrations. */
  subject: string;
  /**
   * Makes the field an editor. Omitted, it is the read-mostly registration
   * version: capture once, no manual entry.
   */
  onCoordinatesChange?: (next: Coordinates | null) => void;
}) {
  const editable = onCoordinatesChange != null;
  const [manual, setManual] = useState(false);
  const pinned = state === 'ready' && coordinates != null;

  return (
    <View style={styles.panel}>
      {editable ? (
        <MandiMapPicker
          value={coordinates}
          onChange={(place) => onCoordinatesChange?.({
            latitude: place.latitude,
            longitude: place.longitude,
          })}
          searchPlaceholder={`Search for this ${subject}`}
        />
      ) : null}

      <View style={styles.row}>
        <Ionicons
          name={pinned ? 'location' : 'location-outline'}
          size={20}
          color={pinned ? Colors.success : Colors.textSecondary}
        />
        <View style={styles.text}>
          <MandiText variant="bodyEmphasis">
            {pinned ? 'Location pinned' : `Pin this ${subject} on the map`}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {message(state, coordinates, subject)}
          </MandiText>
        </View>
      </View>

      {manual && editable ? (
        <View style={styles.manual}>
          <MandiFormField
            label="Latitude"
            value={coordinates?.latitude ?? ''}
            onChangeText={(text) =>
              onCoordinatesChange?.({
                latitude: clean(text),
                longitude: coordinates?.longitude ?? '',
              })
            }
            placeholder="12.9352"
            keyboardType="decimal-pad"
            style={styles.flex}
          />
          <MandiFormField
            label="Longitude"
            value={coordinates?.longitude ?? ''}
            onChangeText={(text) =>
              onCoordinatesChange?.({
                latitude: coordinates?.latitude ?? '',
                longitude: clean(text),
              })
            }
            placeholder="77.6245"
            keyboardType="decimal-pad"
            style={styles.flex}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        {/* Shown whatever the state. Correcting a pin is as ordinary as setting
            one, and more likely on a settings screen than on a form. */}
        <MandiButton
          label={
            state === 'asking' ? 'Locating…'
              : pinned ? 'Update from my location'
              : state === 'idle' ? 'Use my current location'
              : 'Try again'
          }
          variant={pinned ? 'neutral' : 'secondary'}
          size="sm"
          loading={state === 'asking'}
          onPress={onCapture}
          fullWidth={false}
        />
        {editable ? (
          <MandiButton
            label={manual ? 'Done' : 'Enter coordinates'}
            variant="neutral"
            size="sm"
            onPress={() => setManual(!manual)}
            fullWidth={false}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Digits, one dot and a leading minus — a coordinate, not arithmetic. */
function clean(raw: string): string {
  const stripped = raw.replace(/[^\d.-]/g, '');
  const negative = stripped.startsWith('-');
  const [whole, ...rest] = stripped.replace(/-/g, '').split('.');
  const joined = rest.length > 0 ? `${whole}.${rest.join('')}` : whole ?? '';
  return negative ? `-${joined}` : joined;
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
    // The panel is a block of its own, not another field: butted against the
    // input above it, the map read as part of the State box.
    marginTop: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  text: { flex: 1, gap: Spacing.xs },
  manual: { flexDirection: 'row', gap: Spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  flex: { flex: 1 },
});
