import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Colors, WalletColors } from '@/theme';

export type ScanQrIconVariant = 'filled' | 'white' | 'ink';

/**
 * The QuickScan glyph: four scan corners around a small QR. Drawn once, from the
 * reference geometry, so the tile, the tab entry and the buttons all show the same mark.
 *
 * <p>`filled` is the white glyph on an orange disc, `white` the glyph alone (to sit inside a
 * coloured circle), `ink` the glyph alone in dark ink, scaled up to fill its box.
 *
 * <p><b>`size` is the circle's diameter</b> for `filled` and `white`: the glyph is drawn at
 * 47 percent of it (the reference proportion) and its strokes scale with it, so a caller
 * never sizes the glyph itself. Pass the diameter of the circle the icon sits in.
 */
export function ScanQrIcon({
  size = 24, variant = 'filled',
}: { size?: number; variant?: ScanQrIconVariant }) {
  const stroke = variant === 'ink' ? WalletColors.scanInk : Colors.white;
  const scale = variant === 'ink' ? 1.9 : 1;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      testID={`scan-qr-icon-${variant}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {variant === 'filled' && <Circle cx={48} cy={48} r={48} fill={Colors.primary} />}
      <G transform={`translate(48 48) scale(${scale}) translate(-48 -48)`}>
        <G fill="none" stroke={stroke} strokeWidth={3.45} strokeLinecap="butt" strokeLinejoin="round">
          <Path d="M27 37 V33 A6 6 0 0 1 33 27 H37" />
          <Path d="M59 27 H63 A6 6 0 0 1 69 33 V37" />
          <Path d="M27 59 V63 A6 6 0 0 0 33 69 H37" />
          <Path d="M59 69 H63 A6 6 0 0 0 69 63 V59" />
        </G>
        <G fill="none" stroke={stroke} strokeWidth={3.2} strokeLinejoin="round">
          <Rect x={35.5} y={34.9} width={10} height={10} rx={1.6} />
          <Rect x={51} y={34.9} width={10} height={10} rx={1.6} />
          <Rect x={35.5} y={51} width={10} height={10} rx={1.6} />
          <Path d="M61 56 V51 H51 V61 H55.6" />
        </G>
        <Rect x={58.9} y={59} width={3.45} height={3.45} rx={1} fill={stroke} />
      </G>
    </Svg>
  );
}

export default ScanQrIcon;
