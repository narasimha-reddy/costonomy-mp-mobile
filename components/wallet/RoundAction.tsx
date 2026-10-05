import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/**
 * A round action with its label underneath — the wallet's Withdraw, Add money and
 * History. `primary` fills the circle in the brand colour: the one thing this
 * screen is mostly for.
 */
export function RoundAction({
  icon, label, onPress, primary = false, disabled = false, testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
  /** Greyed and not pressable (offline, say). */
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={disabled ? { disabled: true } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.circle, primary && styles.primaryCircle]}>
        <Ionicons
          name={icon}
          size={IconSize.lg}
          color={primary ? Colors.textInverse : Colors.primary}
        />
      </View>
      <MandiText variant="captionEmphasis">{label}</MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1, alignItems: 'center', gap: Spacing.xs, minHeight: 72 },
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
