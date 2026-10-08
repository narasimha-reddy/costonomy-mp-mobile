import React from 'react';
import { View } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { TRUCK_VIEWBOX, truckShapes, type TruckShape } from '@/lib/maps/truckSvg';
import { TrackLayout } from '@/theme';

/**
 * The delivery partner's marker: a delivery truck seen from above, cab first, with the Costonomy C on the roof of its
 * cargo box. The shapes come from lib/maps/truckSvg.ts, which the web Google marker draws too.
 *
 * <p>It faces north; `heading` (degrees clockwise from north) turns it about its centre. The native map marker leaves
 * `heading` at 0 and turns the marker itself (its `rotation`), so the map can keep it flat. `muted` is the stale
 * position: the same truck in grey.
 */
export function TruckTopIcon({
  size = TrackLayout.truckSize,
  muted = false,
  heading = 0,
}: {
  size?: number;
  muted?: boolean;
  heading?: number;
}) {
  return (
    <View testID="truck-icon" style={heading ? { transform: [{ rotate: `${heading}deg` }] } : undefined}>
      <Svg width={size} height={size} viewBox={`0 0 ${TRUCK_VIEWBOX} ${TRUCK_VIEWBOX}`} accessibilityLabel="Delivery truck">
        {truckShapes(muted).map(shape)}
      </Svg>
    </View>
  );
}

function shape(s: TruckShape) {
  switch (s.kind) {
    case 'rect':
      return (
        <Rect
          key={s.key}
          x={s.x}
          y={s.y}
          width={s.width}
          height={s.height}
          rx={s.rx}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
        />
      );
    case 'ellipse':
      return <Ellipse key={s.key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} />;
    case 'path':
      return <Path key={s.key} d={s.d} fill={s.fill} />;
  }
}
