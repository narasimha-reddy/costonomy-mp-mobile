import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { WalletColors } from '@/theme';

/** The four glyphs of the scan screen, drawn from the reference geometry (stroke weights differ from Ionicons). */

const WHITE = WalletColors.white;

export function BackGlyph({ size = 14.2 }: { size?: number }) {
  return (
    <Svg width={size} height={size * (21 / 24)} viewBox="0 0 24 21" fill="none">
      <Path
        d="M22.5 10.5 H2.5 M11 2 L2.5 10.5 L11 19"
        stroke={WHITE}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HelpGlyph({ size = 17.5 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Circle cx={15} cy={15} r={13.5} stroke={WHITE} strokeWidth={3} />
      <Path
        d="M11 11.2 A4.1 4.1 0 1 1 16.8 15 C15.5 15.7 15 16.4 15 17.8"
        stroke={WHITE}
        strokeWidth={2.8}
        strokeLinecap="round"
      />
      <Circle cx={15} cy={22} r={1.7} fill={WHITE} />
    </Svg>
  );
}

export function UploadGlyph({ size = 17 }: { size?: number }) {
  return (
    <Svg width={size} height={size * (28 / 29)} viewBox="0 0 29 28" fill="none">
      <Rect x={1.25} y={1.25} width={26.5} height={25.5} rx={5} stroke={WHITE} strokeWidth={2.5} />
      <Path
        d="M1.8 21.5 L9.8 12.5 L15.8 19 L19.5 15.3 L27.2 23"
        stroke={WHITE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Circle cx={21} cy={8.5} r={2.1} stroke={WHITE} strokeWidth={2.5} />
    </Svg>
  );
}

export function TorchGlyph({ size = 16.5 }: { size?: number }) {
  return (
    <Svg width={size * (19 / 28)} height={size} viewBox="0 0 19 28" fill="none">
      <Path
        d="M2.5 1.25 H16.5 V7 L13.5 10.5 V24.75 A2 2 0 0 1 11.5 26.75 H7.5 A2 2 0 0 1 5.5 24.75 V10.5 L2.5 7 Z"
        stroke={WHITE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Path d="M2.5 7 H16.5" stroke={WHITE} strokeWidth={2.5} />
      <Path d="M9.5 14 V19" stroke={WHITE} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
