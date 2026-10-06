import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WalletColors, WalletLayout } from '@/theme';
import type { ScanGeometry } from '@/lib/quickscan/scanGeometry';

/**
 * The dimmed camera with a clear rounded window and four orange corner brackets.
 *
 * <p>Four dim rectangles around the window (no mask library), plus the window's four
 * corners filled with the same dim colour to round it. The brackets are decoration
 * 16 dp inside the window.
 */
export function ScanOverlay({ window: win }: { window: ScanGeometry['window'] }) {
  const { left, top, size } = win;
  const radius = WalletLayout.scanWindowRadius;
  const inset = WalletLayout.scanBracketInset;
  const boxW = size - inset * 2;
  const boxH = size - WalletLayout.scanBracketInsetTop - WalletLayout.scanBracketInsetBottom;
  const s = WalletLayout.scanBracketStroke;
  const arm = WalletLayout.scanBracketArm;
  const r = WalletLayout.scanBracketRadius;
  const o = s / 2; // keep the stroke inside the box
  const far = boxW - o;
  const farV = boxH - o;
  // The arm's ink runs `arm` dp from the box edge: the stroke's round cap is inside it.
  const a = arm;
  const b = boxW - arm;
  const bv = boxH - arm;
  const k = radius;
  // The square of the window minus its rounded rectangle: only the four corners are left to fill.
  const corners = `M0 0H${size}V${size}H0Z M${k} 0A${k} ${k} 0 0 0 0 ${k}V${size - k}`
    + `A${k} ${k} 0 0 0 ${k} ${size}H${size - k}A${k} ${k} 0 0 0 ${size} ${size - k}`
    + `V${k}A${k} ${k} 0 0 0 ${size - k} 0Z`;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="scan-overlay">
      <View style={[styles.dim, { left: 0, right: 0, top: 0, height: top }]} />
      <View style={[styles.dim, { left: 0, width: left, top, height: size }]} />
      <View style={[styles.dim, { right: 0, width: left, top, height: size }]} />
      <View style={[styles.dim, { left: 0, right: 0, top: top + size, bottom: 0 }]} />
      <Svg
        testID="scan-window"
        style={{ position: 'absolute', left, top }}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <Path d={corners} fill={WalletColors.scanDim} fillRule="evenodd" />
      </Svg>
      <Svg
        testID="scan-brackets"
        style={{ position: 'absolute', left: left + inset, top: top + WalletLayout.scanBracketInsetTop }}
        width={boxW}
        height={boxH}
        viewBox={`0 0 ${boxW} ${boxH}`}
        fill="none"
        stroke={WalletColors.orange}
        strokeWidth={s}
        strokeLinecap="round"
      >
        <Path d={`M${o} ${a}V${o + r}A${r} ${r} 0 0 1 ${o + r} ${o}H${a}`} />
        <Path d={`M${b} ${o}H${far - r}A${r} ${r} 0 0 1 ${far} ${o + r}V${a}`} />
        <Path d={`M${o} ${bv}V${farV - r}A${r} ${r} 0 0 0 ${o + r} ${farV}H${a}`} />
        <Path d={`M${far} ${bv}V${farV - r}A${r} ${r} 0 0 1 ${far - r} ${farV}H${b}`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: WalletColors.scanDim },
});
