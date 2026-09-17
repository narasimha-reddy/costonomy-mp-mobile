import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiBottomSheet } from './MandiBottomSheet';
import { MandiButton } from './MandiButton';
import { MandiText } from './MandiText';
import { Colors, Spacing } from '@/theme';

/**
 * "Are you sure?", for the few places that deserve one.
 *
 * <p>A confirmation is a tax on every future use of an action, so it is worth
 * paying only where the action throws away work that cannot be got back by
 * pressing the same button again. Undo is better wherever undo is possible.
 *
 * <p>The confirming button carries the verb — "Discard changes", not "OK". A
 * dialog answered with "OK" is answered without reading it, and the label is the
 * last chance to say what is about to happen.
 */
export function MandiConfirm({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep editing',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  /** The verb. Never "OK" — see above. */
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onCancel}
      title={title}
      closeLabel={cancelLabel}
    >
      <View style={styles.body}>
        {message != null && (
          <MandiText variant="body" color={Colors.textSecondary}>{message}</MandiText>
        )}
        <MandiButton
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          size="lg"
          onPress={onConfirm}
        />
        <MandiButton label={cancelLabel} variant="neutral" onPress={onCancel} />
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingTop: Spacing.sm },
});
