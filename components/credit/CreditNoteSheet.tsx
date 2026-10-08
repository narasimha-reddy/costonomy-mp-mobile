import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useIssueCreditNote } from '@/hooks/useIssueCreditNote';
import { CREDIT_NOTE_REASONS, noteBody } from '@/lib/credit/creditNotes';
import { checkAmount, cleanAmountInput, plainAmount } from '@/lib/credit/recordPayment';
import type { CreditNoteReason } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';
import { radioProps } from '@/lib/a11y';

const NOTE_MAX = 500;

/**
 * Issue a credit note on one open invoice (plan S13). A credit note is not a payment: it takes
 * an amount off what is owed (short supply, damaged goods, a price difference). The amount starts
 * at what the server says is still owed and is sent as the text typed, at most 2 decimals; the
 * server refuses more than is owed and says how much is. What the invoice reads afterwards is the
 * server's answer, shown as sent. The idempotency key lives in `useIssueCreditNote`.
 */
export function CreditNoteSheet({
  visible, onClose, invoice, offline,
}: {
  visible: boolean;
  onClose: () => void;
  invoice: { id: number; agreementId: number; invoiceNumber: string; outstanding: string };
  offline: boolean;
}) {
  const { issue, pending, error, result, reset } = useIssueCreditNote(invoice.agreementId);
  const [amountText, setAmountText] = useState(plainAmount(invoice.outstanding));
  const [reason, setReason] = useState<CreditNoteReason | null>(null);
  const [note, setNote] = useState('');
  const tapped = useRef(false);

  useEffect(() => {
    if (visible) {
      setAmountText(plainAmount(invoice.outstanding)); setReason(null); setNote(''); reset(); tapped.current = false;
    }
    // Opening starts a fresh form; a refetch that changes the outstanding must not wipe what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const check = checkAmount(amountText);
  const canSend = check.amount != null && reason != null && !pending && !offline;

  async function submit() {
    if (!canSend || check.amount == null || reason == null || tapped.current) return;
    tapped.current = true;
    try {
      await issue(invoice.id, noteBody(check.amount, reason, note));
    } finally {
      tapped.current = false;
    }
  }

  if (result != null) {
    return (
      <MandiBottomSheet visible={visible} onClose={onClose} title="Credit note issued" closeLabel="Close" testID="cn-sheet">
        <View style={styles.body} testID="cn-done">
          <MandiText variant="bodyEmphasis" accessibilityLiveRegion="polite">
            {`Credit note ${result.creditNoteNumber} issued.`}
          </MandiText>
          <MandiText variant="body">{`${formatMoney(result.amount)} taken off ${result.invoiceNumber}.`}</MandiText>
          <MandiText variant="body" color={Colors.textSecondary}>
            {`Still owed on ${result.invoiceNumber}: ${formatMoney(result.invoice.outstanding)}`}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>The restaurant has been told.</MandiText>
          <MandiButton testID="cn-close" label="Done" onPress={onClose} />
        </View>
      </MandiBottomSheet>
    );
  }

  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title="Issue a credit note" closeLabel="Close" avoidKeyboard testID="cn-sheet">
      <View style={styles.body}>
        <MandiText variant="body" color={Colors.textSecondary} numberOfLines={2}>{invoice.invoiceNumber}</MandiText>
        <View style={styles.note}>
          <MandiText variant="body">
            A credit note takes an amount off what they owe. It is not a payment, and nothing is collected.
          </MandiText>
        </View>

        <MandiText variant="captionEmphasis" muted>Why?</MandiText>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {CREDIT_NOTE_REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <Pressable
                key={r.value}
                testID={`cn-reason-${r.value}`}
                onPress={() => { setReason(r.value); reset(); }}
                disabled={pending}
                accessibilityRole="radio"
                accessibilityLabel={r.label}
                {...radioProps(active, pending)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>{r.label}</MandiText>
              </Pressable>
            );
          })}
        </View>

        <MandiFormField
          label="Amount"
          value={amountText}
          onChangeText={(next) => { setAmountText(cleanAmountInput(next)); reset(); }}
          prefix="₹"
          keyboardType="decimal-pad"
          maxLength={16}
          required
          disabled={pending}
          error={check.error}
          hint={`Still owed: ${formatMoney(invoice.outstanding)}`}
          testID="cn-amount"
        />
        <MandiFormField
          label="Note (optional)"
          value={note}
          onChangeText={(next) => { setNote(next); reset(); }}
          placeholder="What happened?"
          multiline
          maxLength={NOTE_MAX}
          disabled={pending}
          hint="The restaurant sees this."
          testID="cn-note"
        />

        {check.amount != null && reason != null && (
          <MandiText variant="body" testID="cn-preview">
            {`${formatMoney(check.amount)} will be taken off ${invoice.invoiceNumber}. The restaurant will be told.`}
          </MandiText>
        )}
        {error != null && (
          <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" testID="cn-error">
            {error}
          </MandiText>
        )}
        {offline && <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>}
        <MandiButton
          testID="cn-submit"
          label={check.amount != null ? `Issue ${formatMoney(check.amount)} credit note` : 'Issue credit note'}
          loading={pending}
          disabled={!canSend}
          onPress={() => { void submit(); }}
        />
        {reason == null && (
          <MandiText variant="caption" color={Colors.textTertiary} center>Choose a reason to continue.</MandiText>
        )}
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  note: { padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.surfaceSunken },
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
