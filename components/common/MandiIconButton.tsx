import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Radius, TouchTarget, hitSlopFor } from '@/theme';

interface MandiIconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Required — an icon button has no visible text for a screen reader to read. */
  accessibilityLabel: string;
  size?: keyof typeof IconSize;
  color?: string;
  /** Renders a circular tinted background behind the icon. */
  background?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Icon-only action. PRD §23A.3.
 *
 * `accessibilityLabel` is a required prop rather than an optional one: an icon
 * button without a label is unusable with a screen reader, and §23A.48 makes
 * semantic labels for icons a hard requirement. Making it required means the
 * type checker catches the omission instead of an audit months later.
 *
 * The pressable always claims at least a 44pt target via `hitSlop`, however
 * small the glyph is.
 */
export function MandiIconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 'lg',
  color = Colors.textPrimary,
  background,
  loading = false,
  disabled = false,
  style,
  testID,
}: MandiIconButtonProps) {
  const glyph = IconSize[size];
  const inert = disabled || loading;
  const box = background ? TouchTarget.min : glyph;

  return (
    <Pressable
      testID={testID}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inert, busy: loading }}
      hitSlop={hitSlopFor(box)}
      style={({ pressed }) => [
        styles.base,
        background != null && {
          width: TouchTarget.min,
          height: TouchTarget.min,
          borderRadius: Radius.full,
          backgroundColor: background,
        },
        pressed && !inert && styles.pressed,
        inert && styles.inert,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={glyph} color={inert ? Colors.textDisabled : color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  inert: { opacity: 0.5 },
});

export default MandiIconButton;
