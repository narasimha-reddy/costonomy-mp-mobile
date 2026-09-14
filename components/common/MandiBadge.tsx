import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';

interface MandiBadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  testID?: string;
}

/** A small emphasis label — "Best value", "Fastest", "New". PRD §23A.3. */
export function MandiBadge({
  label,
  color = Colors.primary,
  backgroundColor = Colors.primaryLight,
  icon,
  style,
  testID,
}: MandiBadgeProps) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor }, style]}
    >
      {icon && <Ionicons name={icon} size={IconSize.xs} color={color} />}
      <MandiText variant="label" color={color} numberOfLines={1}>
        {label}
      </MandiText>
    </View>
  );
}

/**
 * The "Recommended" / "Best value" badge, with the reason attached.
 *
 * `reason` is mandatory because §23A.13 and doc 07 §5 require a recommendation
 * to say *why*, and doc 07 §5 adds that an explanation must never be shown
 * unless the backend's calculation actually supports it. Pass the explanation
 * code the API returned (`BEST_TOTAL_VALUE`, `FASTEST_AVAILABLE`, …) resolved to
 * copy — never a string the client guessed.
 */
export function MandiRecommendedBadge({
  reason,
  testID,
}: {
  reason: string;
  testID?: string;
}) {
  return (
    <MandiBadge
      testID={testID}
      label={reason}
      icon="sparkles"
      color={Colors.recommended}
      backgroundColor={Colors.recommendedLight}
    />
  );
}

/** An unread count for a tab or bell icon. Caps at 99+. */
export function MandiCountBadge({ count, testID }: { count: number; testID?: string }) {
  if (count <= 0) return null;
  const text = count > 99 ? '99+' : String(count);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${count} unread`}
      style={styles.count}
    >
      <MandiText variant="label" color={Colors.textInverse}>
        {text}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MandiBadge;
