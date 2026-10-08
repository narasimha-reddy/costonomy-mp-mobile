import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useWriteOff } from '@/hooks/useWriteOff';
import {
  WRITE_OFF_QUICK_REASONS, writeOffBody, writeOffConsequence,
} from '@/lib/credit/creditNotes';
import { checkAmount, cleanAmountInput, plainAmount } from '@/lib/credit/recordPayment';
import { reasonCheck } from '@/lib/credit/supplierLine';
import type { WriteOffQuickReason } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';
import { radioProps } from '@/lib/a11y';

const REASON_MAX = 500;

export interface WriteOffSheetTarget {
  kind: 'invoice' | 'line';
  /** The invoice id, or the agreement id for the whole line. */
  id: number;
  agreementId: number;
  /** What is being written off: the invoice number, or the restaurant. */
  title: string;
  /** The server's figure for what is owed on it, already on screen. */
  outstanding: string;
}

type Step = 'form' | 'confirm';

/**
 * Write off what is owed (plan S12, owner and admin only). Two steps so it cannot be done by a
 * stray tap: the form (amount, reason, keep the line open) and a confirmation that says in plain
 * words what happens. The amount starts at the outstanding the server already sent; left as it is,
 * NO amount is sent and the server writes off everything it says is owed. The result is the
 * server's answer as sent. The key lives in `useWriteOff`.
 */
export function WriteOffSheet({
  visible, onClose, target, offline,
}: {
  visible: boolean;
  onClose: () => void;
  target: WriteOffSheetTarget;
  offline: boolean;
}) {
  const { writeOff, pending, error, result, reset } = useWriteOff(target.agreementId);
  const initial = plainAmount(target.outstanding);
  const [step, setStep] = useState<Step>('form');
  const [amountText, setAmountText] = useState(initial);
  const [reason, setReason] = useState('');
  const [quick, setQuick] = useState<WriteOffQuickReason | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const tapped = useRef(false);

  useEffect(() => {
    if (visible) {
      setStep('form'); setAmountText(plainAmount(target.outstanding)); setReason(''); setQuick(null);
      setKeepOpen(false); reset(); tapped.current = false;
    }
    // Opening starts a fresh form; a refetch that changes the outstanding must not wipe what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A refused try goes back to the form, with the reason shown, so the person can change it.
  useEffect(() => { if (error != null) setStep('form'); }, [error]);

  const check = checkAmount(amountText);
  const untouched = amountText === initial;
  const validForm = check.amount != null && reasonCheck(reason) && !offline;
  // What is on screen: the figure typed, or the server's outstanding.
  const shown = untouched ? target.outstanding : check.amount ?? target.outstanding;

  async function send() {
    if (!validForm || pending || tapped.current) return;
    tapped.current = true;
    try {
      await writeOff(
        { kind: target.kind, id: target.id },
        writeOffBody({
          amount: untouched ? null : check.amount, reason, quick, keepLineOpen: keepOpen,
        }),
      );
    } finally {
      tapped.current = false;
    }
  }

  if (result != null) {
    return (
      <MandiBottomSheet visible={visible} onClose={onClose} title="Written off" closeLabel="Close" testID="wo-sheet">
        <View style={styles.body} testID="wo-result">
          <MandiText variant="bodyEmphasis" accessibilityLiveRegion="polite">
            {`${formatMoney(result.writtenOff)} written off.`}
          </MandiText>
          {result.items.map((item) => (
            <MandiText key={item.creditNoteId} variant="body" color={Colors.textSecondary}>
              {`${item.invoiceNumber}: ${formatMoney(item.amount)} written off, ${formatMoney(item.outstanding)} still owed (${item.creditNoteNumber})`}
            </MandiText>
          ))}
          <MandiText variant="body">
            {result.lineSuspended ? 'Their credit line is paused.' : 'Their credit line stays open.'}
          </MandiText>
          <MandiButton testID="wo-done" label="Done" onPress={onClose} />
        </View>
      </MandiBottomSheet>
    );
  }

  const title = target.kind === 'line' ? 'Write off everything owed' : 'Write off';
  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title={title} closeLabel="Close" avoidKeyboard testID="wo-sheet">
      {step === 'confirm' ? (
        <View style={styles.body}>
          <MandiText variant="body" color={Colors.textSecondary} numberOfLines={2}>{target.title}</MandiText>
          <View style={styles.warn}>
            <MandiText variant="bodyEmphasis" testID="wo-consequence">{writeOffConsequence(shown, keepOpen)}</MandiText>
          </View>
          <MandiButton
            testID="wo-confirm"
            label="Yes, write off"
            variant="destructive"
            loading={pending}
            disabled={pending || offline}
            onPress={() => { void send(); }}
          />
          <MandiButton testID="wo-back" label="Go back" variant="neutral" disabled={pending} onPress={() => setStep('form')} />
        </View>
      ) : (
        <View style={styles.body}>
          <MandiText variant="body" color={Colors.textSecondary} numberOfLines={2}>{target.title}</MandiText>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {WRITE_OFF_QUICK_REASONS.map((r) => {
              const active = quick === r.value;
              return (
                <Pressable
                  key={r.value}
                  testID={`wo-quick-${r.value}`}
                  onPress={() => { setQuick(r.value); setReason(r.label); reset(); }}
                  accessibilityRole="radio"
                  accessibilityLabel={r.label}
                  {...radioProps(active)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>{r.label}</MandiText>
                </Pressable>
              );
            })}
          </View>
          <MandiFormField
            label="Reason"
            value={reason}
            onChangeText={(text) => { setReason(text); reset(); }}
            placeholder="Why are you writing this off?"
            required
            multiline
            maxLength={REASON_MAX}
            hint="At least 3 characters. Kept in your records."
            testID="wo-reason"
          />
          <MandiFormField
            label="Amount to write off"
            value={amountText}
            onChangeText={(next) => { setAmountText(cleanAmountInput(next)); reset(); }}
            prefix="₹"
            keyboardType="decimal-pad"
            maxLength={16}
            required
            error={check.error}
            hint={`Owed: ${formatMoney(target.outstanding)}. Leave it to write off everything owed.`}
            testID="wo-amount"
          />
          <Pressable
            testID="wo-keep-open"
            onPress={() => { setKeepOpen((v) => !v); reset(); }}
            accessibilityRole="switch"
            accessibilityState={{ checked: keepOpen }}
            accessibilityLabel="Keep the line open. Otherwise their credit line is paused."
            style={styles.switchRow}
          >
            <View style={styles.flex}>
              <MandiText variant="bodyEmphasis">Keep the line open</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>Off: their credit line is paused.</MandiText>
            </View>
            <Switch value={keepOpen} onValueChange={() => { setKeepOpen((v) => !v); reset(); }} trackColor={{ true: Colors.primary, false: Colors.borderStrong }} />
          </Pressable>
          {error != null && (
            <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" testID="wo-error">{error}</MandiText>
          )}
          {offline && <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>}
          <MandiButton
            testID="wo-review"
            label="Review write-off"
            variant="destructive"
            disabled={!validForm}
            onPress={() => setStep('confirm')}
          />
        </View>
      )}
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  flex: { flex: 1 },
  warn: { padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.surfaceSunken },
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TouchTarget.min },
});
