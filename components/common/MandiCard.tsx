import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Colors, Elevation, Radius, Spacing, type ElevationToken } from '@/theme';

interface MandiCardProps {
  children: React.ReactNode;
  /** Makes the whole card a single tap target. */
  onPress?: () => void;
  elevation?: ElevationToken;
  /** Tighter padding for dense list rows. */
  compact?: boolean;
  /** Draws a 1px border instead of a shadow — for cards on a white background. */
  outlined?: boolean;
  /** Left accent stripe, e.g. countdown urgency on a supplier's new-order card. */
  accentColor?: string;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
}

/** The container every piece of grouped content sits in. PRD §23A.3. */
export function MandiCard({
  children,
  onPress,
  elevation = 'card',
  compact = false,
  outlined = false,
  accentColor,
  style,
  testID,
  accessibilityLabel,
}: MandiCardProps) {
  const body = (
    <View
      style={[
        styles.card,
        outlined ? styles.outlined : Elevation[elevation],
        { padding: compact ? Spacing.cardPaddingCompact : Spacing.cardPadding },
        accentColor != null && {
          borderLeftWidth: 3,
          borderLeftColor: accentColor,
          paddingLeft: (compact ? Spacing.cardPaddingCompact : Spacing.cardPadding) - 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.9 },
});

export default MandiCard;
