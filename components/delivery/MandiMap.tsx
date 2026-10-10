import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { MAPS_CONFIGURED } from '@/lib/maps/config';
import { useTileWatchdog } from '@/lib/maps/tileWatchdog';
import { fitTargetFor, truckClearOfPinsM } from '@/lib/maps/googleLegs';
import { regionFor, toLatLng, type LatLng } from '@/lib/delivery/mapGeometry';
import { useSmoothHeading, useTruckHeading } from '@/hooks/useTruckHeading';
import { TruckTopIcon } from './TruckTopIcon';
import { MandiMapSketch, type MandiMapProps, type MapMode } from './MandiMapSketch';
import { Colors, Radius, TrackLayout } from '@/theme';

export type { MandiMapProps, MapMode };

/** How long a custom marker is redrawn after it appears or changes: the Android blank-marker workaround. */
const TRACK_MS = 500;
/** Pins sit above the truck marker (which has no zIndex of its own, so 0). */
const PIN_Z = 10;

/**
 * The delivery map. Doc 05 §16.
 *
 * <p>Native only — `MandiMap.web.tsx` is the web build, and it is a real view of
 * the same data rather than a placeholder, because the whole restaurant app is
 * checked in a browser.
 *
 * <p>Without a `mode` it is the plain map it has always been (the supplier and order previews). With one it draws
 * the route facts: dashed pickup to drop before a partner is on the way, a solid line from the truck to the drop,
 * and a ring around the drop when the truck is close.
 *
 * <p>On Android a key can be refused with no error, which leaves a blank map. The tile watchdog falls back to the
 * schematic when `onMapLoaded` has not fired in 6 s, and `EXPO_PUBLIC_DELIVERY_MAP=sketch` forces the schematic.
 *
 * <p>Google's MapView draws nothing without a Maps SDK key in the Android manifest,
 * so with no key configured (`MAPS_CONFIGURED` false) this shows the same schematic
 * as the web build instead of a blank panel.
 *
 * <p><b>A stale position is drawn differently, never drawn as current.</b> Doc 06
 * §8: an old fix shown as if it were live is worse than no fix, because the
 * restaurant plans around it.
 */
export function MandiMap(props: MandiMapProps) {
  const { driver, destination, stale, height = 220, bare = false, pickup = null, mode, audience = 'buyer' } = props;
  const watched = MAPS_CONFIGURED && Platform.OS === 'android' && !forcedSketch();
  const watchdog = useTileWatchdog(undefined, watched);
  // Followed on every fix, even while the sketch is shown, so the truck faces the right way if the map comes back.
  const heading = useTruckHeading(driver);

  const focus = driver ? toLatLng(driver) : destination;

  if (!focus) return null;
  if (!MAPS_CONFIGURED || forcedSketch() || watchdog.failed) return <MandiMapSketch {...props} />;

  const truck = driver ? toLatLng(driver) : null;
  // The same framing as the web map (`fitTargetFor`): the truck and the next stop, a bad far-off fix left out.
  const framed = mode == null ? [] : fitTargetFor(mode, truck, pickup, destination);
  const region =
    mode == null || framed.length === 0
      ? { ...focus, latitudeDelta: 0.03, longitudeDelta: 0.03 }
      : regionFor(framed);

  return (
    <View style={[styles.container, bare && styles.bare, { height }]}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        region={region}
        pointerEvents="none"
        onMapLoaded={watchdog.onLoaded}
      >
        {mode != null && <Route mode={mode} truck={truck} pickup={pickup} drop={destination} />}
        {mode == null && driver && (
          <Marker
            coordinate={toLatLng(driver)}
            title={stale ? 'Last known position' : 'Delivery partner'}
            pinColor={stale ? Colors.textTertiary : Colors.primary}
            opacity={stale ? 0.6 : 1}
          />
        )}
        {mode != null && truck && mode !== 'placed' && mode !== 'pending' && (
          <TruckMarker
            at={truckClearOfPinsM(truck, [pickup, destination].filter((p): p is LatLng => p != null), heading)}
            stale={stale}
            heading={heading}
          />
        )}
        {mode != null && pickup && <Marker coordinate={pickup} title="Supplier" pinColor={Colors.textPrimary} zIndex={PIN_Z} />}
        {destination && (
          <Marker coordinate={destination} title={audience === 'supplier' ? 'Restaurant' : 'You'} pinColor={Colors.success} zIndex={PIN_Z} />
        )}
      </MapView>
    </View>
  );
}

/** The escape hatch for test builds: the schematic whatever the key says. Read per render so tests can flip it. */
const forcedSketch = () => process.env.EXPO_PUBLIC_DELIVERY_MAP === 'sketch';

/** The lines and ring for a mode. All straight segments between known points: there is no route source. */
function Route({ mode, truck, pickup, drop }: { mode: MapMode; truck: LatLng | null; pickup: LatLng | null; drop: LatLng | null }) {
  const dashed = (coordinates: LatLng[]) => (
    <Polyline
      coordinates={coordinates}
      strokeColor={Colors.routePending}
      strokeWidth={2}
      lineDashPattern={[6, 5]}
    />
  );
  const solid = (coordinates: LatLng[]) => (
    <Polyline coordinates={coordinates} strokeColor={Colors.deliveryRoute} strokeWidth={4} />
  );
  return (
    <>
      {mode === 'pending' && pickup && drop && dashed([pickup, drop])}
      {/* Assigned, no rider location yet: the plan is the dashed route, no truck. */}
      {(mode === 'live' || mode === 'arriving' || mode === 'reached') && !truck && pickup && drop && dashed([pickup, drop])}
      {(mode === 'live' || mode === 'arriving') && truck && (
        pickup
          ? (
            <>
              {solid([truck, pickup])}
              {drop && dashed([pickup, drop])}
            </>
          )
          : drop && solid([truck, drop])
      )}
      {(mode === 'arriving' || mode === 'reached') && drop && (
        <Circle
          center={drop}
          radius={mode === 'arriving' ? TrackLayout.geofenceArriveM : TrackLayout.geofenceReachM}
          // Outline only while arriving: the 300 m ring would fill the whole view and wash the map.
          fillColor={mode === 'reached' ? Colors.geofenceFill : 'transparent'}
          strokeColor={Colors.geofenceStroke}
        />
      )}
    </>
  );
}

/**
 * The truck, flat on the map and turned to its heading by the marker's own `rotation` (eased the short way round), so
 * the image is not redrawn for a turn. A custom marker view is redrawn only while `tracksViewChanges` is on, so it is
 * on for the first moments after it appears or its colours change (stale) and then off; left on it burns the battery.
 */
function TruckMarker({ at, stale, heading }: { at: LatLng; stale: boolean; heading: number }) {
  const [track, setTrack] = useState(true);
  const rotation = useSmoothHeading(heading);
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), TRACK_MS);
    return () => clearTimeout(t);
  }, [stale]);
  return (
    <Marker coordinate={at} anchor={{ x: 0.5, y: 0.5 }} zIndex={1} flat rotation={rotation} tracksViewChanges={track}>
      <TruckTopIcon size={TrackLayout.truckSize} muted={stale} />
    </Marker>
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
