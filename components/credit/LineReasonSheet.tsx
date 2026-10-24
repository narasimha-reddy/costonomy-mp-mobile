import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { MAX_REASON, reasonCheck } from '@/lib/credit/supplierLine';
import { Colors, Spacing } from '@/theme';

/**
 * A sheet that asks the supplier for one reason and then does one thing: suspend, reinstate
 * or decline a request. The reason is required (3 to 500 characters) because the
 * restaurant sees it and every change is on the record.
 *
 * <p>Presentational: the request, its error and its pending state belong to the caller.
 * The confirm button is off while the request runs, so a double tap sends one request.
 */
export function LineReasonSheet({
  visible, onClose, title, intro, note, reasonLabel, placeholder, confirmLabel, destructive = false,
  pending, error, offline, onSubmit, testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  /** An extra plain-words note under the intro (the reinstate warning). */
  note?: string | null;
  reasonLabel: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  offline: boolean;
  onSubmit: (reason: string) => void;
  testID: string;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);

  const valid = reasonCheck(reason);
  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title={title} closeLabel="Close" avoidKeyboard testID={testID}>
      <View style={styles.body}>
        <MandiText variant="body" color={Colors.textSecondary}>{intro}</MandiText>
        {note != null && note !== '' && (
          <View style={styles.note} testID={`${testID}-note`}>
            <MandiText variant="caption" color={Colors.textSecondary}>{note}</MandiText>
          </View>
        )}
        <MandiFormField
          label={reasonLabel}
          value={reason}
          onChangeText={setReason}
          placeholder={placeholder}
          required
          multiline
          maxLength={MAX_REASON}
          disabled={pending}
          hint="The restaurant sees this."
          testID={`${testID}-reason`}
        />
        {error != null && (
          <MandiText variant="caption" color={Colors.danger} testID={`${testID}-error`}>{error}</MandiText>
        )}
        {offline && (
          <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>
        )}
        <MandiButton
          testID={`${testID}-confirm`}
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          loading={pending}
          disabled={!valid || pending || offline}
          onPress={() => onSubmit(reason.trim())}
        />
        {!valid && (
          <MandiText variant="caption" color={Colors.textTertiary} center>
            Add a reason of at least 3 characters to continue.
          </MandiText>
        )}
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  note: { padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.surfaceSunken },
});
