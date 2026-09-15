import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';
import { MandiButton } from './MandiButton';

interface MandiEmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  /** What is empty. "No open requirements". */
  title: string;
  /**
   * *Why* it may be empty, in the user's terms. §23A.46 asks for this
   * specifically — "Nothing here" without a reason leaves the user unsure
   * whether the app is broken or they simply have no data yet.
   */
  description?: string;
  /** The most useful next action. Omit only when there genuinely isn't one. */
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /**
   * Inline density, for a section on a screen that has other sections.
   *
   * <p>The full-height treatment is right when emptiness *is* the screen — an
   * empty Orders tab. It is wrong stacked three times down a home screen, where
   * each hero-sized "nothing here" pushes the next section below the fold and a
   * restaurant with no data scrolls past three illustrations to reach the
   * catalog. Compact keeps the same words and drops the staging.
   */
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/** PRD §23A.3 / §23A.46. */
export function MandiEmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  style,
  testID,
}: MandiEmptyStateProps) {
  if (compact) {
    return (
      <View style={[styles.compact, style]} testID={testID}>
        <Ionicons name={icon} size={IconSize.md} color={Colors.textTertiary} />
        <View style={styles.compactText}>
          <MandiText variant="bodyEmphasis">{title}</MandiText>
          {description != null && (
            <MandiText variant="caption" muted>{description}</MandiText>
          )}
        </View>
        {actionLabel != null && onAction != null && (
          <MandiButton label={actionLabel} onPress={onAction} variant="tertiary" size="md" fullWidth={false} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={IconSize.hero} color={Colors.textTertiary} />
      </View>

      <MandiText variant="subtitle" center>
        {title}
      </MandiText>

      {description != null && (
        <MandiText variant="bodyRelaxed" muted center style={styles.description}>
          {description}
        </MandiText>
      )}

      {actionLabel != null && onAction != null && (
        <MandiButton
          label={actionLabel}
          onPress={onAction}
          fullWidth={false}
          style={styles.action}
        />
      )}

      {secondaryActionLabel != null && onSecondaryAction != null && (
        <MandiButton
          label={secondaryActionLabel}
          onPress={onSecondaryAction}
          variant="tertiary"
          size="md"
          fullWidth={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
  },
  compactText: { flex: 1, gap: Spacing.xs },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.huge,
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  description: { paddingHorizontal: Spacing.md },
  action: { marginTop: Spacing.lg },
});

export default MandiEmptyState;
