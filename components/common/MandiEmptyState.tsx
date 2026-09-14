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
  style,
  testID,
}: MandiEmptyStateProps) {
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
