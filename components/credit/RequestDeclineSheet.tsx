import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { DECLINE_REASONS } from '@/lib/credit/requestContext';
import { MAX_REASON, reasonCheck } from '@/lib/credit/supplierLine';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * Declining a request: a quick reason fills the box (and can be edited); "Other" empties it. A
 * reason of 3 to 500 characters is required because the restaurant sees it. Presentational.
 */
export function RequestDeclineSheet({
  visible, onClose, pending, error, offline, onSubmit, testID = 'decline-sheet',
}: {
  visible: boolean;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  offline: boolean;
  onSubmit: (reason: string) => void;
  testID?: string;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);

  const valid = reasonCheck(reason);
  const pick = (option: string) => setReason(option === 'Other' ? '' : option);
  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title="Decline this request" closeLabel="Close" avoidKeyboard testID={testID}>
      <View style={styles.body}>
        <MandiText variant="body" color={Colors.textSecondary}>
          The restaurant is told you declined, with your reason.
        </MandiText>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {DECLINE_REASONS.map((option) => {
            const active = option === 'Other' ? false : reason === option;
            return (
              <Pressable
                key={option}
                onPress={() => pick(option)}
                disabled={pending}
                accessibilityRole="radio"
                accessibilityLabel={option}
                accessibilityState={{ selected: active, disabled: pending }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>{option}</MandiText>
              </Pressable>
            );
          })}
        </View>
        <MandiFormField
          label="Reason"
          value={reason}
          onChangeText={setReason}
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
          label="Decline Request"
          variant="destructive"
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
