import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';
import { MandiButton } from './MandiButton';

interface MandiErrorStateProps {
  /**
   * A human-readable message (§23A.46). Map API error codes to copy through
   * `lib/error-messages.ts` — never render a raw `code` or a provider message
   * at the user.
   */
  message: string;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Shown small and muted under the message, for support to quote. */
  requestId?: string;
  style?: ViewStyle;
  testID?: string;
}

/** PRD §23A.3 / §23A.46. Always offers retry when the caller can retry. */
export function MandiErrorState({
  message,
  title = 'Something went wrong',
  onRetry,
  retrying = false,
  requestId,
  style,
  testID,
}: MandiErrorStateProps) {
  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      // Announced as soon as it appears, so a screen-reader user learns the
      // request failed instead of waiting on a screen that never fills in.
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconCircle}>
        <Ionicons name="alert-circle-outline" size={IconSize.hero} color={Colors.danger} />
      </View>

      <MandiText variant="subtitle" center>
        {title}
      </MandiText>

      <MandiText variant="bodyRelaxed" muted center>
        {message}
      </MandiText>

      {onRetry != null && (
        <MandiButton
          label="Try again"
          icon="refresh"
          onPress={onRetry}
          loading={retrying}
          fullWidth={false}
          style={styles.action}
        />
      )}

      {requestId != null && (
        <MandiText variant="caption" color={Colors.textTertiary} center style={styles.requestId}>
          Reference: {requestId}
        </MandiText>
      )}
    </View>
  );
}

/**
 * A compact inline error for one failed section of an otherwise-loaded screen.
 *
 * Home (§23A.9, doc 05 §5) loads several independent sections; one failing feed
 * must not blank the whole screen, and each failed section retries on its own.
 */
export function MandiInlineError({
  message,
  onRetry,
  retrying = false,
  testID,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.inline} testID={testID} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={IconSize.md} color={Colors.danger} />
      <MandiText variant="caption" style={styles.inlineText}>
        {message}
      </MandiText>
      {onRetry != null && (
        <MandiButton
          label="Retry"
          onPress={onRetry}
          variant="tertiary"
          size="md"
          loading={retrying}
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
    backgroundColor: Colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  action: { marginTop: Spacing.lg },
  requestId: { marginTop: Spacing.md },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  inlineText: { flex: 1 },
});

export default MandiErrorState;
