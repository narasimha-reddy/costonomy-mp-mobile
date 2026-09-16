import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ControlHeight, IconSize, Radius, Spacing, TextStyles } from '@/theme';
import { MandiText } from './MandiText';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'neutral' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface MandiButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'leading' | 'trailing';
  /**
   * Shows a spinner and blocks presses.
   *
   * Every mutation button must set this while its request is in flight
   * (PRD §33, doc 10 §34). Note this is a *duplicate-tap* guard for the user's
   * benefit only — it is not a correctness mechanism. Server-side idempotency
   * via `Idempotency-Key` remains mandatory regardless (doc 04 §21).
   */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
  /** Defaults to `label`. Set when the label alone is not self-describing. */
  accessibilityLabel?: string;
  /** Read by screen readers after the label — e.g. "Sends the order to the supplier". */
  accessibilityHint?: string;
}

const VARIANTS: Record<
  ButtonVariant,
  { bg: string; fg: string; border?: string }
> = {
  primary: { bg: Colors.primary, fg: Colors.textInverse },
  secondary: { bg: Colors.surface, fg: Colors.primary, border: Colors.primary },
  tertiary: { bg: 'transparent', fg: Colors.primary },
  /**
   * A routine action that is not the point of the screen.
   *
   * <p>Brand colour is a claim about importance. Spending it on "mark out of
   * stock" — something a supplier does a dozen times a day — leaves nothing to
   * distinguish the action that actually matters, and a row of orange buttons
   * reads as a row of warnings. Neutral is the right weight for most inline
   * actions; `secondary` is for the one that leads.
   */
  neutral: { bg: Colors.surfaceSunken, fg: Colors.textPrimary, border: Colors.border },
  destructive: { bg: Colors.danger, fg: Colors.textInverse },
};

/**
 * The one button. PRD §23A.3.
 *
 * `loading` and `disabled` are both honoured for presses, so a caller cannot
 * accidentally leave a submitting button tappable.
 */
export function MandiButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'leading',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: MandiButtonProps) {
  const palette = VARIANTS[variant];
  const inert = disabled || loading;
  const height = size === 'lg' ? ControlHeight.lg
    : size === 'sm' ? ControlHeight.sm
    : ControlHeight.md;

  const fg = inert && variant !== 'primary' && variant !== 'destructive'
    ? Colors.textDisabled
    : palette.fg;

  // A dense action should not carry a CTA's padding, or three of them will not
  // fit on one row at 390pt.
  const paddingHorizontal = size === 'sm' ? Spacing.md
    : size === 'md' ? Spacing.lg
    : Spacing.xxl;

  return (
    <Pressable
      testID={testID}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      // `busy` is what makes a screen reader announce the in-flight state rather
      // than silently reporting a button that does nothing when activated.
      accessibilityState={{ disabled: inert, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal,
          backgroundColor: inert && variant === 'primary' ? Colors.borderStrong
            : inert && variant === 'destructive' ? Colors.borderStrong
            : palette.bg,
          borderWidth: palette.border ? 1 : 0,
          borderColor: inert ? Colors.border : palette.border,
        },
        fullWidth && styles.fullWidth,
        pressed && !inert && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'leading' && (
            <Ionicons name={icon} size={size === 'sm' ? IconSize.sm : IconSize.md} color={fg} />
          )}
          <MandiText
            style={[size === 'sm' ? TextStyles.captionEmphasis : TextStyles.bodyEmphasis, { color: fg }]}
            numberOfLines={1}
          >
            {label}
          </MandiText>
          {icon && iconPosition === 'trailing' && (
            <Ionicons name={icon} size={size === 'sm' ? IconSize.sm : IconSize.md} color={fg} />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});

export default MandiButton;
