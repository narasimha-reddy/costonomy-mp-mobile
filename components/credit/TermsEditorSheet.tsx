import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import {
  PERIOD_CHIPS, checkTerms, draftFromAgreement, minLimitHint, type TermsDraft,
} from '@/lib/credit/supplierLine';
import type { CreditAgreement } from '@/models/credit';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';
import { radioState } from '@/lib/a11y';

/** What the change does, in words, by where the line is. */
function effectNote(mode: 'modify' | 'approve', status: string): string {
  if (mode === 'approve') {
    return 'Anything different from what they asked for is an offer: the restaurant has to accept it before the credit works.';
  }
  if (status === 'ACTIVE') return 'The change takes effect at once, and the restaurant is told.';
  if (status === 'APPROVED') return 'The restaurant has to accept the new terms before the credit works.';
  return 'The restaurant is told about the change.';
}

/**
 * The terms editor (S10): limit, payment period, grace, per-order cap and, when the
 * server sends it, the overdue amount that pauses the line. Replaces the inline edit modes.
 *
 * <p>`modify` changes a live line (reason required); `approve` answers a request on the
 * supplier's own terms (note optional). Checks here are hints: the server decides, and its
 * own message (for a limit below what is drawn, say) is shown under the form.
 * A new period or grace applies only to new invoices; the sheet says so.
 */
export function TermsEditorSheet({
  visible, onClose, agreement, mode, pending, error, offline, onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  agreement: CreditAgreement;
  mode: 'modify' | 'approve';
  pending: boolean;
  error: string | null;
  offline: boolean;
  onSubmit: (draft: TermsDraft) => void;
}) {
  const [draft, setDraft] = useState<TermsDraft>(() => draftFromAgreement(agreement));
  useEffect(() => {
    if (visible) setDraft(draftFromAgreement(agreement));
    // Reset when the sheet opens, not on every refetch of the line under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const reasonRequired = mode === 'modify';
  const check = useMemo(
    () => checkTerms(draft, { minLimit: agreement.minLimit, reasonRequired }),
    [draft, agreement.minLimit, reasonRequired],
  );
  const firstProblem = Object.values(check.errors)[0] ?? null;
  const showThreshold = agreement.maxOverdueAmount !== undefined;
  const floor = minLimitHint(agreement.minLimit);
  const set = (key: keyof TermsDraft) => (text: string) => setDraft((d) => ({ ...d, [key]: text }));
  const money = (key: keyof TermsDraft) => (text: string) =>
    setDraft((d) => ({ ...d, [key]: text.replace(/[^\d.]/g, '') }));
  const whole = (key: keyof TermsDraft) => (text: string) =>
    setDraft((d) => ({ ...d, [key]: text.replace(/\D/g, '') }));

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title={mode === 'modify' ? 'Change the terms' : 'Approve on your terms'}
      closeLabel="Close"
      avoidKeyboard
      testID="terms-sheet"
    >
      <View style={styles.body}>
        <MandiText variant="caption" color={Colors.textSecondary} testID="terms-effect">
          {effectNote(mode, agreement.status)}
        </MandiText>

        <MandiFormField
          label="Credit limit"
          value={draft.limit}
          onChangeText={money('limit')}
          prefix="₹"
          keyboardType="decimal-pad"
          maxLength={12}
          required
          disabled={pending}
          error={check.errors.limit}
          hint={floor ?? 'A cut never takes back what is already drawn or on hold.'}
          testID="terms-limit"
        />

        <View>
          <MandiText variant="captionEmphasis" muted>Payment period</MandiText>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {PERIOD_CHIPS.map((option) => {
              const active = draft.days === String(option);
              return (
                <Pressable
                  key={option}
                  testID={`terms-period-${option}`}
                  onPress={() => set('days')(String(option))}
                  disabled={pending}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option} days`}
                  accessibilityState={radioState(active, pending)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>
                    {option} days
                  </MandiText>
                </Pressable>
              );
            })}
          </View>
        </View>
        <MandiFormField
          label="Payment period in days (1 to 180)"
          value={draft.days}
          onChangeText={whole('days')}
          keyboardType="number-pad"
          maxLength={3}
          required
          disabled={pending}
          error={check.errors.days}
          testID="terms-days"
        />

        <MandiFormField
          label="Grace days after the due date (0 to 60)"
          value={draft.grace}
          onChangeText={whole('grace')}
          keyboardType="number-pad"
          maxLength={2}
          required
          disabled={pending}
          error={check.errors.grace}
          hint="A new period or grace applies only to new invoices. Existing due dates do not change."
          testID="terms-grace"
        />

        <MandiFormField
          label="Per-order cap (optional)"
          value={draft.cap}
          onChangeText={money('cap')}
          prefix="₹"
          keyboardType="decimal-pad"
          maxLength={12}
          disabled={pending}
          error={check.errors.cap}
          hint="The most one order can take on credit. Empty means no cap."
          testID="terms-cap"
        />

        {showThreshold && (
          <MandiFormField
            label="Pause the line when overdue passes (optional)"
            value={draft.maxOverdue}
            onChangeText={money('maxOverdue')}
            prefix="₹"
            keyboardType="decimal-pad"
            maxLength={12}
            disabled={pending}
            error={check.errors.maxOverdue}
            hint="When what they owe past due goes above this, new orders pause. Empty means never."
            testID="terms-max-overdue"
          />
        )}

        <MandiFormField
          label={reasonRequired ? 'Why are you changing this?' : 'Note (optional)'}
          value={draft.reason}
          onChangeText={set('reason')}
          placeholder={reasonRequired ? 'Good payment history' : 'Happy to start here and review in three months'}
          required={reasonRequired}
          multiline
          maxLength={500}
          disabled={pending}
          hint="The restaurant sees this. Every change is on the record."
          testID="terms-reason"
        />

        {error != null && (
          <MandiText variant="caption" color={Colors.danger} testID="terms-error">{error}</MandiText>
        )}
        {offline && (
          <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>
        )}
        <MandiButton
          testID="terms-save"
          label={mode === 'modify' ? 'Save New Terms' : 'Approve At These Terms'}
          loading={pending}
          disabled={!check.valid || pending || offline}
          onPress={() => onSubmit(draft)}
        />
        {!check.valid && firstProblem != null && (
          <MandiText variant="caption" color={Colors.textTertiary} center testID="terms-blocked">
            {firstProblem}
          </MandiText>
        )}
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
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
