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

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'md' | 'lg';

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
  const height = size === 'lg' ? ControlHeight.lg : ControlHeight.md;

  const fg = inert && variant !== 'primary' && variant !== 'destructive'
    ? Colors.textDisabled
    : palette.fg;

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
            <Ionicons name={icon} size={IconSize.md} color={fg} />
          )}
          <MandiText style={[TextStyles.bodyEmphasis, { color: fg }]} numberOfLines={1}>
            {label}
          </MandiText>
          {icon && iconPosition === 'trailing' && (
            <Ionicons name={icon} size={IconSize.md} color={fg} />
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
    paddingHorizontal: Spacing.xxl,
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
