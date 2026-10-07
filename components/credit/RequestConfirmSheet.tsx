import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Confirms answering a credit request: says what will happen, shows the exact terms when they are
 * not the ones asked for, and only then sends. The confirm button is off while the call runs,
 * so a double tap sends one request. Presentational: the call and its error belong to the caller.
 */
export function RequestConfirmSheet({
  visible, onClose, title, consequence, lines, confirmLabel, pending, error, offline, onConfirm, testID = 'confirm-sheet',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  consequence: string;
  /** The terms about to be sent, one per line (the server's numbers, worded). */
  lines?: string[];
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  offline: boolean;
  onConfirm: () => void;
  testID?: string;
}) {
  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title={title} closeLabel="Close" testID={testID}>
      <View style={styles.body}>
        {lines != null && lines.length > 0 && (
          <View style={styles.terms} testID={`${testID}-terms`} accessible accessibilityLabel={lines.join(', ')}>
            {lines.map((line) => (
              <MandiText key={line} variant="bodyEmphasis">{line}</MandiText>
            ))}
          </View>
        )}
        <MandiText variant="body" color={Colors.textSecondary}>{consequence}</MandiText>
        {error != null && (
          <MandiText variant="caption" color={Colors.danger} testID={`${testID}-error`}>{error}</MandiText>
        )}
        {offline && (
          <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>
        )}
        <MandiButton
          testID={`${testID}-confirm`}
          label={confirmLabel}
          loading={pending}
          disabled={pending || offline}
          onPress={onConfirm}
        />
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  terms: { gap: Spacing.xs, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surfaceSunken },
});
