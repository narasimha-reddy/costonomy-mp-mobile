import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from './MandiText';
import { loadGoogleMaps } from '@/lib/maps/loader';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAPS_CONFIGURED,
  type PickedPlace,
} from '@/lib/maps/config';
import { Colors, Radius, Spacing } from '@/theme';
import type { MandiMapPickerProps } from './MandiMapPicker';


/**
 * Choose a place on a Google map. Web build.
 *
 * <p>Three ways to the same answer, because people arrive knowing different
 * things: type an address and pick a suggestion, drag the pin, or tap the map.
 * All three set one value, and the address underneath is read back from Google
 * rather than from what was typed — so what gets stored is what the pin means,
 * not what somebody believed it meant.
 *
 * <p><b>The coordinates are the record, not the address.</b> Delivery is quoted
 * by distance (doc 06 §4), so the pin is the thing that has to be right. The
 * address and the place id ride along because they make a wrong pin visible: "12
 * Nowhere Road, a different city" is something a person notices.
 */
export function MandiMapPicker({
  value,
  onChange,
  height = 260,
  searchPlaceholder = 'Search for an address',
}: MandiMapPickerProps) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const searchHost = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const geocoder = useRef<any>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The callback changes identity every render; a ref keeps the listeners we
  // attach once from capturing a stale one.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!MAPS_CONFIGURED) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapNode.current) return;
        const google = (window as any).google;

        const start = value?.latitude && value?.longitude
          ? { lat: Number(value.latitude), lng: Number(value.longitude) }
          : { lat: DEFAULT_CENTER.latitude, lng: DEFAULT_CENTER.longitude };

        map.current = new google.maps.Map(mapNode.current, {
          center: start,
          zoom: value?.latitude ? DEFAULT_ZOOM + 2 : DEFAULT_ZOOM,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });

        marker.current = new google.maps.Marker({
          map: map.current,
          position: start,
          draggable: true,
        });

        geocoder.current = new google.maps.Geocoder();

        const settle = (lat: number, lng: number, placeId?: string | null) => {
          // Six decimals is about a tenth of a metre. More is noise, and it makes
          // two pins that are the same place look different in the database.
          const picked: PickedPlace = {
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
            placeId: placeId ?? null,
            formattedAddress: null,
          };
          latest.current(picked);

          // Read the address back rather than trusting what was typed.
          geocoder.current?.geocode({ location: { lat, lng } }, (results: any, status: string) => {
            if (status === 'OK' && results?.[0]) {
              latest.current({
                ...picked,
                placeId: placeId ?? results[0].place_id ?? null,
                formattedAddress: results[0].formatted_address ?? null,
              });
            }
          });
        };

        marker.current.addListener('dragend', () => {
          const p = marker.current.getPosition();
          settle(p.lat(), p.lng());
        });

        map.current.addListener('click', (event: any) => {
          marker.current.setPosition(event.latLng);
          settle(event.latLng.lat(), event.latLng.lng());
        });

        // PlaceAutocompleteElement, not places.Autocomplete.
        //
        // The old widget is "not available to new customers" as of 1 March 2025,
        // so on a key created today it does not work at all — it fails quietly,
        // which is the worst way for a search box to fail. The element is a web
        // component that brings its own input, so it is appended rather than
        // attached to one of ours.
        if (searchHost.current && google.maps.places?.PlaceAutocompleteElement) {
          const element: any = new google.maps.places.PlaceAutocompleteElement({
            // India only: this marketplace does not operate anywhere else, and an
            // unbounded search offers a Bengaluru supplier a road in Ohio.
            includedRegionCodes: ['in'],
          });
          element.style.width = '100%';
          searchHost.current.innerHTML = '';
          searchHost.current.appendChild(element);

          element.addEventListener('gmp-select', async (event: any) => {
            const prediction = event?.placePrediction;
            if (!prediction) return;
            const place = prediction.toPlace();
            await place.fetchFields({ fields: ['location', 'formattedAddress', 'id'] });
            const point = place.location;
            if (!point) return;

            const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
            const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
            map.current.setCenter({ lat, lng });
            map.current.setZoom(DEFAULT_ZOOM + 3);
            marker.current.setPosition({ lat, lng });
            latest.current({
              latitude: lat.toFixed(6),
              longitude: lng.toFixed(6),
              placeId: place.id ?? null,
              formattedAddress: place.formattedAddress ?? null,
            });
          });
        } else if (searchHost.current) {
          // A key old enough to still have the legacy widget, or a build where
          // the element is missing. Say so rather than showing a dead box.
          setError('Address search is unavailable. Drag the pin instead.');
        }

        setReady(true);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });

    return () => { cancelled = true; };
    // Mounted once. Later value changes move the marker below rather than
    // rebuilding the map, which would lose the zoom the person just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in step when the value is changed from outside — typing
  // coordinates by hand, or resetting the form.
  useEffect(() => {
    if (!ready || !value?.latitude || !value?.longitude) return;
    const position = { lat: Number(value.latitude), lng: Number(value.longitude) };
    if (Number.isNaN(position.lat) || Number.isNaN(position.lng)) return;
    marker.current?.setPosition(position);
  }, [ready, value?.latitude, value?.longitude]);

  if (!MAPS_CONFIGURED) {
    return <NotConfigured height={height} />;
  }

  return (
    <View style={styles.block}>
      {/* PlaceAutocompleteElement renders its own input, so this is only a host
          for it. Styling it like our other fields is deliberate: a Google-styled
          box in the middle of a Mandi form reads as someone else's software. */}
      {React.createElement('div', {
        ref: searchHost,
        'aria-label': searchPlaceholder,
        style: {
          minHeight: 44,
          borderRadius: 12,
          border: `1px solid ${Colors.border}`,
          background: Colors.surface,
          overflow: 'hidden',
        },
      })}

      <View style={[styles.canvas, { height }]}>
        {React.createElement('div', {
          ref: mapNode,
          style: { width: '100%', height: '100%' },
        })}
      </View>

      {error ? (
        <MandiText variant="caption" color={Colors.danger}>{error}</MandiText>
      ) : (
        <MandiText variant="caption" color={Colors.textSecondary}>
          Search, or drag the pin. Delivery is quoted from this point, so put it on the
          door you load from rather than the middle of the building.
        </MandiText>
      )}
    </View>
  );
}

/**
 * What a map looks like when it cannot be shown.
 *
 * <p><b>The setting's name is not on the screen.</b> A store owner has no use for
 * an environment variable, and printing our own configuration into the product is
 * both meaningless to them and a small thing to hand a stranger. The detail that
 * a developer needs goes to the console, where a developer is looking; the person
 * holding the phone gets the two things they can act on — that the map is
 * unavailable, and that they can still pin the place another way.
 */
function NotConfigured({ height }: { height: number }) {
  useEffect(() => {
    // For whoever is running the app, not for whoever is using it.
    console.warn(
      '[maps] No API key configured — see docs/GOOGLE_MAPS.md for what to create '
      + 'and where to put it.');
  }, []);

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

const styles = StyleSheet.create({
  block: { gap: Spacing.sm },
  canvas: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSunken,
  },
  missing: {
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
});
