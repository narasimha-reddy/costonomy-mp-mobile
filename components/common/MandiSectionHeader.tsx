import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Spacing } from '@/theme';
import { MandiText } from './MandiText';

interface MandiSectionHeaderProps {
  title: string;
  subtitle?: string;
  /** "See all" affordance on the right. */
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The row above a section on Home, Orders, Credit. PRD §23A.3.
 *
 * `accessibilityRole="header"` is what lets a screen-reader user jump between
 * Home's nine sections (§23A.9) instead of swiping through every card.
 */
export function MandiSectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
  testID,
}: MandiSectionHeaderProps) {
  return (
    <View style={[styles.row, style]} testID={testID}>
      <View style={styles.titles}>
        <MandiText variant="sectionTitle" accessibilityRole="header">
          {title}
        </MandiText>
        {subtitle != null && (
          <MandiText variant="caption" muted>
            {subtitle}
          </MandiText>
        )}
      </View>

      {actionLabel != null && onAction != null && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          hitSlop={8}
          style={styles.action}
        >
          <MandiText variant="captionEmphasis" color={Colors.primary}>
            {actionLabel}
          </MandiText>
          <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: Spacing.md,
  },
  titles: { flex: 1, gap: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});

export default MandiSectionHeader;
