import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useReversePayment } from '@/hooks/useReversePayment';
import { QUICK_REASONS } from '@/lib/credit/reversal';
import { MAX_REASON, reasonCheck } from '@/lib/credit/supplierLine';
import type { ReversalResult, StorePayment } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * Undo a payment the supplier recorded. Says in plain words what happens, asks for a reason
 * (the restaurant sees it), and sends one undo.
 *
 * <p>The payment's own receipt is undone when it has one, so the sheet says that other invoices
 * paid in the same go come back too. The server refuses with plain reasons (too late, already
 * undone, they have used the credit it freed); they are shown here and the person can fix and
 * try again. The idempotency key lives in `useReversePayment`, not here, so closing the sheet
 * after a dropped connection and reopening it keeps the same attempt.
 */
export function UndoPaymentSheet({
  visible, onClose, payment, offline, onDone,
}: {
  visible: boolean;
  onClose: () => void;
  payment: StorePayment | null;
  offline: boolean;
  onDone: (result: ReversalResult, payment: StorePayment) => void;
}) {
  const { reverse, pending, error, reset } = useReversePayment(payment?.agreementId ?? 0);
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const tapped = useRef(false);

  useEffect(() => {
    if (visible) { setReason(''); setChoice(null); reset(); tapped.current = false; }
  }, [visible, reset]);

  if (payment == null) return null;
  const amount = formatMoney(payment.amount);
  const valid = reasonCheck(reason);
  const wholeReceipt = payment.receiptId != null;

  function pick(label: string) {
    setChoice(label);
    setReason(label === 'Other' ? '' : label);
    reset();
  }

  async function submit() {
    if (!valid || pending || offline || payment == null || tapped.current) return;
    tapped.current = true;
    try {
      const result = await reverse(
        { receiptId: payment.receiptId, paymentId: payment.id }, reason.trim());
      if (result != null) onDone(result, payment);
    } finally {
      tapped.current = false;
    }
  }

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title="Undo this payment"
      closeLabel="Close"
      avoidKeyboard
      testID="undo-sheet"
    >
      <View style={styles.body}>
        <MandiText variant="body" color={Colors.textSecondary}>
          {`${payment.invoiceNumber} · ${amount}`}
        </MandiText>
        <View style={styles.note} testID="undo-sheet-explain">
          <MandiText variant="body">
            The restaurant will owe this again and will be told it was cancelled.
          </MandiText>
          {wholeReceipt && (
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.noteGap}>
              If it was recorded together with other invoices, they are all undone too.
            </MandiText>
          )}
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {QUICK_REASONS.map((label) => {
            const active = choice === label;
            return (
              <Pressable
                key={label}
                testID={`undo-reason-${label}`}
                onPress={() => pick(label)}
                disabled={pending}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected: active, disabled: pending }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>
                  {label}
                </MandiText>
              </Pressable>
            );
          })}
        </View>
        <MandiFormField
          label="Reason"
          value={reason}
          onChangeText={(text) => { setReason(text); setChoice((c) => (c !== 'Other' && c !== text ? null : c)); reset(); }}
          placeholder="Why are you undoing it?"
          required
          multiline
          maxLength={MAX_REASON}
          disabled={pending}
          hint="The restaurant sees this."
          testID="undo-sheet-reason"
        />
        {error != null && (
          <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" testID="undo-sheet-error">
            {error}
          </MandiText>
        )}
        {offline && (
          <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>
        )}
        <MandiButton
          testID="undo-sheet-confirm"
          label={`Undo ${amount} payment`}
          variant="destructive"
          loading={pending}
          disabled={!valid || pending || offline}
          onPress={() => { void submit(); }}
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
  noteGap: { marginTop: Spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    justifyContent: 'center',
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
