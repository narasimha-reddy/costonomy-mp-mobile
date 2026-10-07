import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Colors } from '@/theme';

/**
 * The delivery partner's marker: a small truck with an orange parcel box on the back
 * and a dark cab. Drawn here, in the app's own tokens. It faces right; `flip` mirrors it
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
        <Rect x="1" y="3" width="24" height="15" rx="2.5" fill={parcel} />
        <Rect x="4" y="6" width="18" height="9" rx="1.5" fill={parcelLight} />
        <Path d="M26 7h7l5 5v6H26z" fill={Colors.truckCab} />
        <Path d="M28 9h4l3 3h-7z" fill={Colors.truckGlass} />
        <Circle cx="9" cy="19" r="3.2" fill={Colors.truckCab} stroke={Colors.surface} strokeWidth="1" />
        <Circle cx="31" cy="19" r="3.2" fill={Colors.truckCab} stroke={Colors.surface} strokeWidth="1" />
      </Svg>
    </View>
  );
}
