import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Colors } from '@/theme';

/**
 * The delivery partner's marker: one delivery truck: an orange parcel box and cab in a single
 * body on a dark chassis. Drawn here, in the app's own tokens. It faces right; `flip` mirrors it
 * for a bearing between 180 and 360 (see `mirrored` in lib/delivery/mapGeometry).
 * `muted` is the stale position: the same truck in grey.
 */
export function TruckIcon({
  width = 40,
  muted = false,
  flip = false,
}: {
  width?: number;
  muted?: boolean;
  flip?: boolean;
}) {
  const parcel = muted ? Colors.truckMuted : Colors.truckParcel;
  const parcelLight = muted ? Colors.truckMutedLight : Colors.truckParcelLight;
  const height = (width * 24) / 40;
  return (
    <View testID="truck-icon" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Svg width={width} height={height} viewBox="0 0 40 24" accessibilityLabel="Delivery truck">
        <Rect x="1" y="3" width="24" height="14" rx="2.5" fill={parcel} />
        <Rect x="5" y="6" width="16" height="7" rx="1.5" fill={parcelLight} />
        <Path d="M24 7h8l6 6v4H24z" fill={parcel} />
        <Path d="M27 9h4l3 3.5h-7z" fill={Colors.truckGlass} />
        <Rect x="1" y="15" width="37" height="3" rx="1" fill={Colors.truckCab} />
        <Circle cx="9" cy="19" r="3.2" fill={Colors.truckCab} stroke={Colors.surface} strokeWidth="1" />
        <Circle cx="31" cy="19" r="3.2" fill={Colors.truckCab} stroke={Colors.surface} strokeWidth="1" />
      </Svg>
    </View>
  );
}
