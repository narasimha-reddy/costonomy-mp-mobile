import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { MandiFormField } from './MandiFormField';
import { MandiText } from './MandiText';
import {
  DEFAULT_CENTER,
  GOOGLE_MAPS_API_KEY,
  MAPS_CONFIGURED,
  type PickedPlace,
} from '@/lib/maps/config';
import { Colors, Radius, Spacing } from '@/theme';

export interface MandiMapPickerProps {
  value: { latitude: string; longitude: string } | null;
  onChange: (place: PickedPlace) => void;
  height?: number;
  searchPlaceholder?: string;
}

/** Roughly a kilometre across, which frames a neighbourhood. */
const SPAN = 0.012;

/**
 * Choose a place on a Google map. Native build.
 *
 * <p>`react-native-maps` draws the tiles, and search goes to the Places REST API
 * directly — the JavaScript Autocomplete widget the web build uses is a DOM
 * component and does not exist here. Both ends set the same value, so a store
 * pinned on a phone and one pinned in a browser are the same record.
 *
 * <p>Android needs the key in `app.json` under `android.config.googleMaps`, and
 * iOS under `ios.config.googleMapsApiKey`; this file only uses it for the Places
 * request. Tiles come from the platform SDK, which reads those instead.
 */
export function MandiMapPicker({
  value,
  onChange,
  height = 260,
  searchPlaceholder = 'Search for an address',
}: MandiMapPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ description: string; placeId: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  const pinned = Number.isFinite(latitude) && Number.isFinite(longitude)
    && value?.latitude !== '' && value?.longitude !== '';

  const region: Region = {
    latitude: pinned ? latitude : DEFAULT_CENTER.latitude,
    longitude: pinned ? longitude : DEFAULT_CENTER.longitude,
    latitudeDelta: SPAN,
    longitudeDelta: SPAN,
  };

  async function search(text: string) {
    setQuery(text);
    setError(null);
    if (text.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      // India only: an unbounded search offers a Bengaluru supplier a road in Ohio.
      const response = await fetch(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json'
        + `?input=${encodeURIComponent(text)}&components=country:in`
        + `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`);
      const body = await response.json();
      setResults((body.predictions ?? []).slice(0, 5).map(
        (p: { description: string; place_id: string }) =>
          ({ description: p.description, placeId: p.place_id })));
    } catch {
      setError('Could not reach Google. Drag the pin instead.');
    }
  }

  async function choose(placeId: string, description: string) {
    setResults([]);
    setQuery(description);
    try {
      const response = await fetch(
        'https://maps.googleapis.com/maps/api/place/details/json'
        + `?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address`
        + `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`);
      const body = await response.json();
      const point = body.result?.geometry?.location;
      if (!point) return;
      onChange({
        latitude: point.lat.toFixed(6),
        longitude: point.lng.toFixed(6),
        placeId,
        formattedAddress: body.result?.formatted_address ?? null,
      });
    } catch {
      setError('Could not reach Google. Drag the pin instead.');
    }
  }

  if (!MAPS_CONFIGURED) {
    // The setting's name belongs in the console and the docs, not on a screen a
    // store owner is reading. They get the two things they can act on.
    console.warn('[maps] No API key configured — see docs/GOOGLE_MAPS.md.');
    return (
      <View style={[styles.missing, { minHeight: height }]}>
        <Ionicons name="map-outline" size={24} color={Colors.textTertiary} />
        <MandiText variant="bodyEmphasis">Map unavailable</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} center>
          We cannot show the map now. You can still pin this place with the buttons
          below, and everything else on this screen works as usual.
        </MandiText>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <MandiFormField
        label=""
        value={query}
        onChangeText={search}
        placeholder={searchPlaceholder}
        autoCapitalize="none"
      />

      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((result) => (
            <MandiText
              key={result.placeId}
              variant="caption"
              onPress={() => choose(result.placeId, result.description)}
              style={styles.result}
            >
              {result.description}
            </MandiText>
          ))}
        </View>
      ) : null}

      <View style={[styles.canvas, { height }]}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          region={region}
          onPress={(event) => {
            const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
            onChange({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
          }}
        >
          {pinned ? (
            <Marker
              coordinate={{ latitude, longitude }}
              draggable
              onDragEnd={(event) => {
                const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
                onChange({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
              }}
            />
          ) : null}
        </MapView>
      </View>

      <MandiText variant="caption" color={error ? Colors.danger : Colors.textSecondary}>
        {error ?? 'Search, or drag the pin. Delivery is quoted from this point, so put it on '
          + 'the door you load from rather than the middle of the building.'}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.sm },
  canvas: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surfaceSunken },
  results: {
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  result: { padding: Spacing.md },
  missing: {
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
});
