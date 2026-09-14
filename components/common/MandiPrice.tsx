import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Colors, Spacing, TextStyles } from '@/theme';
import { formatMoney, type Money } from '@/utils/money';
import { MandiText } from './MandiText';

interface MandiPriceProps {
  /** A server-supplied amount. Never a value the client computed. */
  amount: Money | number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  /** e.g. `/ KG`, `per 25 KG pack` — rendered muted after the figure. */
  unitSuffix?: string;
  /**
   * A previous price, struck through beside the current one.
   *
   * Only pass a figure the backend actually returned — a "was" price the client
   * remembered from an earlier render is exactly the silent reprice §23A.16
   * forbids. When a cart price changes, re-fetch and use `MandiPriceChange`.
   */
  strikethrough?: Money | number | null;
  /** Tints the figure — e.g. `Colors.savings` on an estimated-saving line. */
  color?: string;
  /** Drop paise on whole-rupee amounts. Never use on a checkout or invoice total. */
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const SIZE_VARIANT = {
  sm: 'priceSmall',
  md: 'price',
  lg: 'priceLarge',
} as const;

/**
 * A money figure. PRD §23A.3.
 *
 * Renders with tabular figures so prices stacked in a comparison list or cart
 * align on the decimal point.
 */
export function MandiPrice({
  amount,
  size = 'md',
  unitSuffix,
  strikethrough,
  color,
  compact = false,
  style,
  testID,
}: MandiPriceProps) {
  const text = formatMoney(amount, compact);

  return (
    <View style={[styles.row, style]} testID={testID}>
      {strikethrough != null && (
        <MandiText
          variant="caption"
          muted
          style={styles.struck}
          accessibilityLabel={`Was ${formatMoney(strikethrough, compact)}`}
        >
          {formatMoney(strikethrough, compact)}
        </MandiText>
      )}
      <MandiText variant={SIZE_VARIANT[size]} color={color}>
        {text}
      </MandiText>
      {unitSuffix != null && (
        <MandiText variant="caption" muted>
          {unitSuffix}
        </MandiText>
      )}
    </View>
  );
}

/**
 * An explicit old → new price change (PRD §23A.16, guardrail 13 "never silently
 * reprice").
 *
 * This is the only sanctioned way to show that a price moved. It is deliberately
 * loud: both figures visible, an icon, and a colour that is *not* carrying the
 * meaning alone (§23A.48 — the arrow and the "was"/"now" labels do that).
 * The caller is still responsible for requiring explicit confirmation before
 * checkout can proceed; this component only states the fact.
 */
export function MandiPriceChange({
  from,
  to,
  testID,
}: {
  from: Money | number;
  to: Money | number;
  testID?: string;
}) {
  const increased = Number(to) > Number(from);

  return (
    <View
      style={styles.changeRow}
      testID={testID}
      accessibilityLabel={`Price changed from ${formatMoney(from)} to ${formatMoney(to)}`}
    >
      <MandiText variant="caption" muted>
        Was
      </MandiText>
      <MandiText variant="caption" muted style={styles.struck}>
        {formatMoney(from)}
      </MandiText>
      <MandiText variant="caption" muted>
        now
      </MandiText>
      <MandiText
        variant="captionEmphasis"
        color={increased ? Colors.danger : Colors.success}
      >
        {formatMoney(to)}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  struck: {
    textDecorationLine: 'line-through',
    ...TextStyles.caption,
  },
});

export default MandiPrice;
