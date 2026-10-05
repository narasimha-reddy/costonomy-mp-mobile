import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/** An Ionicons name, or an explicit glyph set (`mci` = MaterialCommunityIcons). */
export type RoundActionIcon =
  | keyof typeof Ionicons.glyphMap
  | { set: 'ion'; name: keyof typeof Ionicons.glyphMap }
  | { set: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap };

/**
 * A round action with its label underneath — the wallet's Withdraw, Add money and
 * History. `primary` fills the circle in the brand colour: the one thing this
 * screen is mostly for.
 */
export function RoundAction({
  icon, label, onPress, primary = false, disabled = false, testID, glyphTone = 'default', accessibilityHint,
}: {
  icon: RoundActionIcon;
  label: string;
  onPress: () => void;
  primary?: boolean;
  /** Greyed and not pressable (offline, say). */
  disabled?: boolean;
  testID?: string;
  /**
   * 'strong' draws the outline variant's glyph in primaryDark (orange on the light
   * tint is 2.86:1; primaryDark is 4.27:1). The filled circle is unchanged.
   */
  glyphTone?: 'default' | 'strong';
  accessibilityHint?: string;
}) {
  const glyphColor = primary
    ? Colors.textInverse
    : glyphTone === 'strong' ? Colors.primaryDark : Colors.primary;
  const spec = typeof icon === 'string' ? { set: 'ion' as const, name: icon } : icon;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={disabled ? { disabled: true } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.circle, primary && styles.primaryCircle]}>
        {spec.set === 'mci' ? (
          <MaterialCommunityIcons name={spec.name} size={IconSize.lg} color={glyphColor} />
        ) : (
          <Ionicons name={spec.name} size={IconSize.lg} color={glyphColor} />
        )}
      </View>
      <MandiText variant="captionEmphasis" numberOfLines={2} style={styles.caption}>{label}</MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1, alignItems: 'center', gap: Spacing.xs, minHeight: 72 },
  caption: { textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  circle: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  primaryCircle: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
