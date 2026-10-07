import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ControlHeight, IconSize, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';
import { MandiStickyBar } from './MandiStickyBar';

export interface StickyActionBarProps {
  variant: 'pay' | 'continue';
  /** `pay`: the method column ("PAY USING" over the label). `continue`: only `label` is shown ("3 items added"). */
  left?: { eyebrow: string; label: string; onPress?: () => void };
  /** `pay`: the figure on the button, already formatted. */
  amount?: string;
  /** `pay`: the small caption under the amount, e.g. "TOTAL". */
  amountCaption?: string;
  ctaLabel: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * The bottom action bar: pay (method + amount + orange CTA) or continue (a full-width orange bar).
 *
 * <p>Wraps `MandiStickyBar`, which carries the safe-area inset and the keyboard
 * behaviour, so the bar clears the home indicator like every other bar. `loading`
 * and `disabled` both withhold the press, as `MandiButton` does.
 */
export function StickyActionBar({
  variant, left, amount, amountCaption, ctaLabel, onPress, loading = false, disabled = false,
}: StickyActionBarProps) {
  const inert = loading || disabled;
  const state = { disabled: inert, busy: loading };
  const fill = inert ? Colors.borderStrong : Colors.primary;
  const spinner = <ActivityIndicator size="small" color={Colors.textInverse} />;

  if (variant === 'continue') {
    return (
      <MandiStickyBar>
        <Pressable
          onPress={inert ? undefined : onPress}
          disabled={inert}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          accessibilityState={state}
          style={[styles.continueBar, { backgroundColor: fill }]}
        >
          {loading ? spinner : (
            <>
              <MandiText variant="bodyEmphasis" color={Colors.textInverse} numberOfLines={1} style={styles.shrink}>
                {left?.label ?? ''}
              </MandiText>
              <MandiText variant="bodyEmphasis" color={Colors.textInverse} numberOfLines={1}>{ctaLabel}</MandiText>
            </>
          )}
        </Pressable>
      </MandiStickyBar>
    );
  }

  return (
    <MandiStickyBar>
      <View style={styles.payRow}>
        {left && (
          <Pressable
            onPress={left.onPress}
            disabled={!left.onPress}
            accessibilityRole={left.onPress ? 'button' : undefined}
            accessibilityLabel={`${left.eyebrow}, ${left.label}`}
            style={styles.left}
          >
            <MandiText variant="caption" muted numberOfLines={1}>{left.eyebrow}</MandiText>
            <View style={styles.methodLine}>
              <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.shrink}>{left.label}</MandiText>
              {left.onPress && <Ionicons name="chevron-up" size={IconSize.sm} color={Colors.textSecondary} />}
            </View>
          </Pressable>
        )}
        <Pressable
          onPress={inert ? undefined : onPress}
          disabled={inert}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          accessibilityState={state}
          style={[styles.cta, { backgroundColor: fill }]}
        >
          {loading ? spinner : (
            <>
              {amount != null && (
                <View style={styles.amountCol}>
                  <MandiText variant="priceLarge" color={Colors.textInverse} numberOfLines={1}>{amount}</MandiText>
                  {amountCaption ? (
                    <MandiText variant="caption" color={Colors.textInverse} numberOfLines={1}>{amountCaption}</MandiText>
                  ) : null}
                </View>
              )}
              <MandiText variant="bodyEmphasis" color={Colors.textInverse} numberOfLines={1}>{ctaLabel}</MandiText>
            </>
          )}
        </Pressable>
      </View>
    </MandiStickyBar>
  );
}

const styles = StyleSheet.create({
  payRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  left: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' },
  methodLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  shrink: { flexShrink: 1 },
  cta: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    minHeight: ControlHeight.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
  },
  amountCol: { alignItems: 'flex-start' },
  continueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: ControlHeight.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
  },
});
