import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, ControlHeight, IconSize, Radius, Spacing } from '@/theme';

/** An outlined pill with an icon and a label — "My statements", "Filters ⌄". */
export function PillButton({
  label, icon, trailingIcon, onPress, testID,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={IconSize.sm} color={Colors.textPrimary} />
      <MandiText variant="captionEmphasis">{label}</MandiText>
      {trailingIcon != null && (
        <Ionicons name={trailingIcon} size={IconSize.sm} color={Colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: ControlHeight.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  pressed: { opacity: 0.85 },
});
