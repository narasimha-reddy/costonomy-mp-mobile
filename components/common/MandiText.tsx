import React from 'react';
import { Text, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { Colors, TextStyles, type TextVariant } from '@/theme';

interface MandiTextProps extends TextProps {
  variant?: TextVariant;
  /** A colour token value from `Colors`. Defaults to `Colors.textPrimary`. */
  color?: string;
  /** Convenience for the very common muted-secondary case. */
  muted?: boolean;
  center?: boolean;
  style?: TextStyle | TextStyle[];
}

/**
 * Every piece of text in the app renders through this.
 *
 * Going through one component is what makes the type scale actually hold: a
 * bare `<Text>` with an inline `fontSize` is invisible in review, and three of
 * them are a design system that has already failed.
 */
export function MandiText({
  variant = 'body',
  color,
  muted = false,
  center = false,
  style,
  ...rest
}: MandiTextProps) {
  return (
    <Text
      {...rest}
      style={StyleSheet.flatten([
        TextStyles[variant],
        { color: color ?? (muted ? Colors.textSecondary : Colors.textPrimary) },
        center && { textAlign: 'center' as const },
        style,
      ])}
    />
  );
}

export default MandiText;
