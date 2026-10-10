import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

const TOOTH_W = 14;
const TOOTH_H = 7;
const FALLBACK_W = 320;

/** A zigzag along the bottom edge: `M0 0 L7 7 L14 0 ...`, then closed along the top. Pure, so it is testable. */
export function zigzagPath(width: number): string {
  const teeth = Math.max(1, Math.ceil(width / TOOTH_W));
  let d = 'M0 0';
  for (let i = 0; i < teeth; i += 1) {
    d += ` L${i * TOOTH_W + TOOTH_W / 2} ${TOOTH_H} L${(i + 1) * TOOTH_W} 0`;
  }
  return `${d} Z`;
}

/**
 * The delivered receipt's header: a paper slip with a slot bar above it, a bag with a tick, the title, a dashed
 * divider and the subtitle, and a zigzag bottom edge drawn in the paper colour so it reads as torn.
 *
 * <p>Drawn with react-native-svg, which renders on native and on web. The zigzag follows the measured width.
 */
export function ReceiptHero({ title, subtitle }: { title: string; subtitle: string | null }) {
  const [width, setWidth] = useState(FALLBACK_W);
  return (
    <View style={styles.wrap} onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setWidth(w); }}>
      <View style={styles.slot} />
      <View style={styles.paper}>
        <Svg width={52} height={52} viewBox="0 0 52 52" style={styles.bag} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d="M10 18h32l-2.5 28H12.5z" fill={Colors.success} />
          <Path d="M18 18v-4a8 8 0 0 1 16 0v4" stroke={Colors.success} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Circle cx="26" cy="32" r="9" fill={Colors.surface} />
          <Path d="M21.5 32l3.5 3.5 6-7" stroke={Colors.success} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <MandiText variant="subtitle" style={styles.title} accessibilityRole="header">{title}</MandiText>
        {subtitle != null && subtitle !== '' && (
          <>
            <View style={styles.divider} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.subtitle}>{subtitle}</MandiText>
          </>
        )}
      </View>
      <Svg width="100%" height={TOOTH_H} viewBox={`0 0 ${width} ${TOOTH_H}`} preserveAspectRatio="none" style={styles.edge}>
        <Path testID="receipt-zigzag" d={zigzagPath(width)} fill={Colors.surface} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  slot: {
    height: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.textPrimary,
    marginHorizontal: Spacing.xs,
    marginBottom: -Spacing.xs,
    zIndex: 1,
  },
  paper: {
    backgroundColor: Colors.surface,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  bag: { marginBottom: Spacing.md },
  title: { textAlign: 'center' },
  divider: {
    alignSelf: 'stretch',
    marginVertical: Spacing.md,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  subtitle: { textAlign: 'center' },
  edge: { alignSelf: 'stretch' },
});
