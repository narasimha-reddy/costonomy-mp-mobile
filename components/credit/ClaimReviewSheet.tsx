import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import {
  REJECT_REASONS, checkConfirmAmount, duplicateWarning, rejectReasonText, waitingText, type RejectReason,
} from '@/lib/credit/claimInbox';
import { claimMethodLabel } from '@/lib/credit/claims';
import type { ClaimResponse } from '@/models/credit';
import { formatDay, relative } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { serverNow } from '@/lib/server-clock';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';
import { radioProps } from '@/lib/a11y';

/** The claimed amount as the plain figure the field starts with: "5000", "1200.5". */
function prefill(amount: string | number): string {
  const text = String(amount);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/**
 * The supplier answers one "Paid direct" claim: yes, I received it (optionally a
 * lower amount) or no, I did not.
 *
 * <p>Presentational. The request, key, refresh and toast live in `useDecideClaim`.
 * The amount starts at the claimed amount and can be lowered, never raised; the
 * server decides the cap (what is still outstanding) and its message is shown
 * under the buttons. A claim changes nothing until the supplier confirms it, and
 * the sheet says so.
 */
export function ClaimReviewSheet({
  claim, visible, onClose, canAct, offline, pending, error, onConfirm, onReject, onEdit, initialMode = 'review',
}: {
  claim: ClaimResponse | null;
  visible: boolean;
  onClose: () => void;
  /** CREDIT_COLLECT or CREDIT_MODIFY. Otherwise the sheet only shows the claim. */
  canAct: boolean;
  offline: boolean;
  pending: boolean;
  error: string | null;
  /** `amount` null: confirm what was claimed. */
  onConfirm: (claim: ClaimResponse, amount: string | null) => void;
  onReject: (claim: ClaimResponse, reason: string) => void;
  /** The person changed something: clear any earlier error. */
  onEdit: () => void;
  /** Which step the sheet opens on: the restaurant detail's Reject goes straight to "Why not?". */
  initialMode?: 'review' | 'reject';
}) {
  const [mode, setMode] = useState<'review' | 'reject'>(initialMode);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [reasonText, setReasonText] = useState('');

  const claimId = claim?.id;
  useEffect(() => {
    setMode(initialMode);
    setAmountText(claim == null ? '' : prefill(claim.amount));
    setReason(null);
    setReasonText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId, visible, initialMode]);

  if (claim == null) return null;

  const check = checkConfirmAmount(amountText, claim.amount);
  const rejectText = rejectReasonText(reason, reasonText);
  const busy = pending || offline;
  const sent = relative(new Date(claim.createdAt), new Date(serverNow()));
  const waiting = waitingText(claim);
  const duplicate = duplicateWarning(claim);

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title="Did you receive this payment?"
      closeLabel="Close"
      avoidKeyboard
      testID="claim-review-sheet"
    >
      <View style={styles.body}>
        <View style={styles.facts}>
          <MandiText variant="bodyEmphasis">
            {`${claim.restaurantName ?? claim.outletName ?? 'A restaurant'} says they paid you directly`}
          </MandiText>
          <Fact label="Amount" value={formatMoney(claim.amount)} />
          <Fact label="Invoice" value={claim.invoiceNumber} />
          <Fact label="How" value={claimMethodLabel(claim.method)} />
          {claim.reference != null && claim.reference !== '' && <Fact label="Reference" value={claim.reference} />}
          <Fact label="Paid on" value={formatDay(claim.paidOn) ?? claim.paidOn} />
          {claim.note != null && claim.note !== '' && <Fact label="Note" value={claim.note} />}
          <Fact label="Sent" value={waiting ?? sent} />
          {claim.invoiceOutstanding != null && (
            <Fact label="Invoice still owes" value={formatMoney(claim.invoiceOutstanding)} />
          )}
          {claim.invoiceOtherOpenClaimsAmount != null && Number(claim.invoiceOtherOpenClaimsAmount) > 0 && (
            <Fact label="Other reports waiting" value={formatMoney(claim.invoiceOtherOpenClaimsAmount)} />
          )}
        </View>

        {duplicate != null && (
          <View style={styles.warning} accessibilityLiveRegion="polite" testID="claim-duplicate-warning">
            <MandiText variant="body" color={Colors.textPrimary}>{duplicate}</MandiText>
          </View>
        )}

        <MandiText variant="caption" color={Colors.textSecondary}>
          Nothing changes on their account until you confirm. Check your bank, UPI or cash first.
        </MandiText>

        {!canAct ? (
          <View style={styles.note} testID="claims-view-only">
            <MandiText variant="body" color={Colors.textSecondary}>
              You can see this payment, but only people who may collect payments for this store can answer it.
              Ask the store owner.
            </MandiText>
          </View>
        ) : mode === 'review' ? (
          <>
            <MandiFormField
              label="Amount you received"
              value={amountText}
              onChangeText={(next) => { setAmountText(next.replace(/[^\d.]/g, '')); onEdit(); }}
              prefix="₹"
              keyboardType="decimal-pad"
              maxLength={12}
              returnKeyType="done"
              disabled={pending}
              error={amountText === '' || amountText === prefill(claim.amount) ? null : check.error}
              hint="You can confirm less than they say, not more."
              testID="claim-confirm-amount"
            />
            {error != null && <ErrorNote message={error} />}
            <MandiButton
              testID="claim-confirm"
              variant="primary"
              label="Yes, I received it"
              loading={pending}
              disabled={busy || !check.valid}
              onPress={() => onConfirm(claim, check.amount)}
            />
            <MandiButton
              testID="claim-reject-start"
              variant="secondary"
              label="I did not receive this"
              disabled={busy}
              onPress={() => { setMode('reject'); onEdit(); }}
            />
          </>
        ) : (
          <>
            <MandiText variant="bodyEmphasis">Why not?</MandiText>
            <View accessibilityRole="radiogroup" style={styles.options}>
              {REJECT_REASONS.map((option) => {
                const selected = reason === option;
                return (
                  <Pressable
                    key={option}
                    testID={`reject-reason-${option}`}
                    onPress={() => { setReason(option); onEdit(); }}
                    disabled={pending}
                    accessibilityRole="radio"
                    accessibilityLabel={option}
                    {...radioProps(selected, pending)}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? Colors.primary : Colors.textTertiary}
                    />
                    <MandiText variant="bodyEmphasis">{option}</MandiText>
                  </Pressable>
                );
              })}
            </View>
            <MandiFormField
              label={reason === 'Other' ? 'Tell the restaurant why' : 'More detail (optional)'}
              value={reasonText}
              onChangeText={(next) => { setReasonText(next); onEdit(); }}
              multiline
              maxLength={400}
              disabled={pending}
              testID="reject-text"
            />
            {error != null && <ErrorNote message={error} />}
            <MandiButton
              testID="claim-reject-send"
              variant="primary"
              label="Tell the restaurant I did not receive it"
              loading={pending}
              disabled={busy || rejectText == null}
              onPress={() => { if (rejectText != null) onReject(claim, rejectText); }}
            />
            <MandiButton
              testID="claim-reject-back"
              variant="tertiary"
              label="Go back"
              disabled={pending}
              onPress={() => { setMode('review'); onEdit(); }}
            />
          </>
        )}
      </View>
    </MandiBottomSheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="body" style={styles.factValue}>{value}</MandiText>
    </View>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.note} accessibilityLiveRegion="polite" testID="claim-error">
      <MandiText variant="body" color={Colors.danger}>{message}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingTop: Spacing.sm },
  facts: { gap: Spacing.xs },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  factValue: { flexShrink: 1, textAlign: 'right' },
  note: { gap: Spacing.sm },
  warning: { padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.warningLight },
  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
