import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReadingDots } from '@/components/wallet/bill/ReadingDots';
import {
  CHIP_TEXT_MAX_SCALE, billChipCopy, billChipTone, type ChipVariant,
} from '@/lib/wallet/billChip';
import type { WalletBillStatus } from '@/models/wallet';
import { BillChipLayout, BillChipType, BillStatusColors, TouchTarget } from '@/theme';

export interface BillStatusChipProps {
  status: WalletBillStatus;
  /** `full` words, `short` word, or the `icon` alone when the row is tight. */
  variant?: ChipVariant;
  /** Makes the chip a button (View the bill, or Add it). Without it the chip only informs. */
  onPress?: () => void;
  testID?: string;
  /**
   * Inside another button (a History row): the chip stays tappable but is not a button of its own,
   * because a button inside a button is invalid on the web and unreachable on iOS. The row offers
   * the same action to screen readers.
   */
  nested?: boolean;
}

const HIT_V = (TouchTarget.min - BillChipLayout.height) / 2;

/**
 * Where a payment's bill stands, as a small pill: a glyph and words, never colour alone.
 * Always 22 dp high (its label stops growing at 1.3x text) and never wraps.
 */
function BillStatusChipBase({ status, variant = 'full', onPress, testID, nested = false }: BillStatusChipProps) {
  const copy = billChipCopy(status);
  const tone = billChipTone(status);
  const color = BillStatusColors[tone.text];
  const iconOnly = variant === 'icon';
  const label = variant === 'full' ? copy.full : copy.short;

  const glyph = tone.icon === 'dot' ? (
    <View style={styles.iconBox}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  ) : tone.icon === 'dots' ? null : (
    <View style={styles.iconBox}>
      <Ionicons name={tone.icon.name} size={BillChipLayout.icon} color={color} />
    </View>
  );

  // The `key` makes a change of status or shape start from a fresh native view. On Android a pill
  // reused across such a change kept its background but drew none of its content until it was
  // remounted (and it clipped to its rounded padding box, which the border toggle moves). Nothing
  // in the pill needs clipping: it is 22 dp high, its label is one line capped at 1.3x text.
  const body = (
    <View
      key={`${status}:${variant}`}
      testID="bill-chip-body"
      style={[
        styles.chip,
        iconOnly && styles.chipIcon,
        { backgroundColor: BillStatusColors[tone.bg] },
        tone.border != null && { borderWidth: 1, borderColor: BillStatusColors[tone.border] },
      ]}
    >
      {iconOnly ? (tone.icon === 'dots' ? <ReadingDots size={BillChipLayout.readingDot} color={color} /> : glyph) : (
        <>
          {glyph}
          <Text
            style={[styles.label, { color }]}
            numberOfLines={1}
            maxFontSizeMultiplier={CHIP_TEXT_MAX_SCALE}
            testID="bill-chip-label"
          >
            {label}
          </Text>
          {tone.icon === 'dots' ? <View style={styles.dotsGap}><ReadingDots size={BillChipLayout.readingDot} color={color} /></View> : null}
        </>
      )}
    </View>
  );

  const id = testID ?? `bill-chip-${status}`;
  if (onPress == null) {
    return (
      <View style={styles.wrap} accessible accessibilityLabel={copy.a11y} testID={id}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessible={!nested}
      accessibilityRole={nested ? undefined : 'button'}
      accessibilityLabel={nested ? undefined : copy.a11y}
      accessibilityHint={nested ? undefined : status === 'PENDING' ? 'Opens Add bill' : 'Opens the bill'}
      hitSlop={{
        top: HIT_V,
        bottom: HIT_V,
        left: iconOnly ? (TouchTarget.min - BillChipLayout.height) / 2 : 0,
        right: iconOnly ? (TouchTarget.min - BillChipLayout.height) / 2 : 0,
      }}
      style={styles.wrap}
      testID={id}
    >
      {body}
    </Pressable>
  );
}

export const BillStatusChip = React.memo(BillStatusChipBase);

const styles = StyleSheet.create({
  wrap: { flexShrink: 0, alignSelf: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BillChipLayout.height,
    borderRadius: BillChipLayout.radius,
    paddingHorizontal: BillChipLayout.padX,
    flexShrink: 0,
  },
  chipIcon: { width: BillChipLayout.height, paddingHorizontal: 0, justifyContent: 'center' },
  iconBox: {
    width: BillChipLayout.icon,
    height: BillChipLayout.icon,
    marginRight: BillChipLayout.gap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: BillChipLayout.dot, height: BillChipLayout.dot, borderRadius: BillChipLayout.dot / 2 },
  dotsGap: { marginLeft: BillChipLayout.gap },
  label: {
    fontFamily: BillChipType.label.fontFamily,
    fontSize: BillChipType.label.fontSize,
    lineHeight: BillChipType.label.lineHeight,
    letterSpacing: BillChipType.label.letterSpacing,
  },
});
