import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Spacing } from '@/theme';
import { MandiText } from './MandiText';

interface MandiSectionHeaderProps {
  title: string;
  /**
   * How many things are in the section.
   *
   * <p>Appended to the label rather than shown as a badge: a count is part of
   * what the group is called — "In progress 3" — and a badge beside it reads as
   * something needing attention, which a count of ordinary work is not.
   */
  count?: number;
  subtitle?: string;
  /** "See all" affordance on the right. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Drops the chevron, for an action that acts on this section rather than
   * opening another screen.
   *
   * <p>"See all ›" goes somewhere; "Clear" does something here. The same arrow on
   * both makes one of them a lie, and the one it lies about is the destructive one.
   */
  inlineAction?: boolean;
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
  count,
  subtitle,
  actionLabel,
  onAction,
  inlineAction = false,
  style,
  testID,
}: MandiSectionHeaderProps) {
  return (
    <View style={[styles.row, style]} testID={testID}>
      <View style={styles.titles}>
        {/* Primary, not secondary: it is the heading for everything below it,
            and a grey heading over black cards reads as a caption for them. */}
        <MandiText
          variant="sectionTitle"
          color={Colors.textPrimary}
          accessibilityRole="header"
        >
          {title}
          {count != null && count > 0 ? `  ${count}` : ''}
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
          {!inlineAction && (
            <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.primary} />
          )}
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
