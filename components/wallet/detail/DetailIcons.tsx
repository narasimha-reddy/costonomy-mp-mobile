import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** The arrow on the avatar and on "Pay again": up-right for money out, down-left for money in. */
export function ArrowGlyph({
  size, color, stroke = 2.2, direction = 'out',
}: { size: number; color: string; stroke?: number; direction?: 'in' | 'out' }) {
  const d = direction === 'out' ? 'M6 18 L18 6 M8 6 H18 V16' : 'M18 6 L6 18 M16 18 H6 V8';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" testID={`arrow-${direction}`}>
      <Path d={d} stroke={color} strokeWidth={stroke * (24 / size)} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The "Transfer details" glyph: a rounded square with three bullet lines. */
export function ListGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={2.5} width={19} height={19} rx={4.5} stroke={color} strokeWidth={2} />
      <Circle cx={7.3} cy={8} r={1} fill={color} />
      <Circle cx={7.3} cy={12} r={1} fill={color} />
      <Circle cx={7.3} cy={16} r={1} fill={color} />
      <Path d="M10.8 8 H17 M10.8 12 H17 M10.8 16 H17" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** The Contact Support glyph: a speech bubble with a question mark. */
export function HelpGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 3.5h14a2.5 2.5 0 0 1 2.5 2.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-6.5L7.5 21v-4H5a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 5 3.5z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path d="M9.8 8.9a2.3 2.3 0 1 1 3.3 2.1c-.7.4-1.1.8-1.1 1.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx={12} cy={14.6} r={0.3} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

/** The copy glyph: a sheet in front of a second one, 11.5 x 15 dp as measured. */
export function CopyGlyph({ width, height, color }: { width: number; height: number; color: string }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 11.5 15" fill="none">
      <Path
        d="M3 3.2 V1.8 Q3 0.8 4 0.8 H9.7 Q10.7 0.8 10.7 1.8 V9.5 Q10.7 10.5 9.7 10.5 H8.4"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <Rect x={0.8} y={3.2} width={7.6} height={11} rx={1.4} stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}
