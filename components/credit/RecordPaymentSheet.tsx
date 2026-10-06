import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useDebounced } from '@/hooks/useDebounced';
import { useRecordPayment } from '@/hooks/useRecordPayment';
import { ApiError } from '@/lib/api/errors';
import { istDay, shiftDay } from '@/lib/credit/claims';
import {
  RECORD_METHODS, checkRecord, cleanAmountInput, plainAmount, previewSummary, receiptSummary, recordBody,
  referenceRequired, type RecordMethod,
} from '@/lib/credit/recordPayment';
import { agreementKey } from '@/lib/queryKeys';
import { serverNow } from '@/lib/server-clock';
import { previewPayment } from '@/services/credit';
import type { SupplierPaymentMethod } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/** Wide enough for a thumb, and grows (minHeight) with the text size. */
const TARGET = 48;
const PREVIEW_DELAY_MS = 400;

/** An open invoice the receipt is aimed at. Figures are the server's. */
export interface RecordTarget {
  id: number;
  invoiceNumber: string;
  outstanding: string | number;
}

type AmountMode = 'full' | 'overdue' | 'other';

const REFERENCE_LABEL: Record<SupplierPaymentMethod, string> = {
  CASH: 'Reference (optional)',
  CARD: 'Reference (optional)',
  UPI: 'UPI reference',
  BANK_TRANSFER: 'Bank reference (UTR)',
  CHEQUE: 'Cheque number',
};

function MethodIcon({ icon, color }: { icon: RecordMethod['icon']; color: string }) {
  return icon.set === 'ion'
    ? <Ionicons name={icon.name as keyof typeof Ionicons.glyphMap} size={IconSize.md} color={color} />
    : <MaterialCommunityIcons name={icon.name as keyof typeof MaterialCommunityIcons.glyphMap} size={IconSize.md} color={color} />;
}

/**
 * The supplier records money a restaurant paid outside the app.
 *
 * <p>Money rules: the amount sent is the text typed (kept as a string); the figures offered
 * (Full, Overdue only, the starting amount) and every figure in the preview are the server's.
 * Nothing is added or subtracted here. The server splits the amount over the open invoices
 * and says what each becomes; this words it.
 *
 * <p>The parent mounts one sheet per opening (`key`), so the draft survives hiding the sheet
 * to review a waiting claim (`visible` false) and is fresh on the next opening. `previewNonce`
 * bumps after such a review so the preview is asked again.
 *
 * <p>No date picker exists in the app, so the day is the same stepper the restaurant's claim
 * form uses, with Today and Yesterday shortcuts; "today" is the India day by the server's clock.
 */
export function RecordPaymentSheet({
  visible, onClose, agreementId, due, overdue, targets, offline, previewNonce = 0, reviewableInvoiceIds = [],
  onReviewClaim,
}: {
  visible: boolean;
  onClose: () => void;
  agreementId: number;
  /** The line's total owed and overdue, as the server sent them. */
  due: string | number | null;
  overdue: string | number | null;
  /** The invoices chosen; empty means the whole line, oldest first. */
  targets: readonly RecordTarget[];
  offline: boolean;
  previewNonce?: number;
  /** Invoices that have a waiting claim the parent can open for review. */
  reviewableInvoiceIds?: readonly number[];
  onReviewClaim?: (invoiceId: number) => void;
}) {
  const { accessToken } = useSession();
  const rec = useRecordPayment(agreementId);
  const today = istDay(new Date(serverNow()));

  const fullAmount = targets.length === 0 ? due : targets.length === 1 ? targets[0]?.outstanding : null;
  const hasOverdue = targets.length === 0 && overdue != null && Number(overdue) > 0;

  const [mode, setMode] = useState<AmountMode>(fullAmount != null ? 'full' : 'other');
  const [amountText, setAmountText] = useState(fullAmount != null ? plainAmount(fullAmount) : '');
  const [method, setMethod] = useState<SupplierPaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState('');

  const draft = { amountText, method, reference, paidOn, note };
  const check = checkRecord(draft, today);
  const ids = targets.map((t) => t.id);
  const idsKey = ids.join(',');

  const settled = useDebounced(check.amount, PREVIEW_DELAY_MS);
  const preview = useQuery({
    queryKey: [...agreementKey(agreementId), 'record-preview', settled, idsKey, previewNonce],
    queryFn: () => previewPayment(accessToken as string, agreementId, {
      amount: settled as string, ...(ids.length > 0 ? { invoiceIds: ids } : {}),
    }),
    enabled: visible && settled != null && accessToken != null && rec.result == null && !offline,
    retry: false,
    gcTime: 0,
  });
  const previewCurrent = settled != null && settled === check.amount;
  const previewRefused = preview.error instanceof ApiError && preview.error.status >= 400
    && preview.error.status < 500 ? preview.error : null;
  const blocked = previewCurrent && previewRefused != null;

  const canSend = check.valid && !rec.pending && !offline && !blocked;
  const dayText = formatDay(paidOn) ?? paidOn;

  function edit() { rec.reset(); }
  function pickAmount(next: AmountMode, text: string) {
    setMode(next);
    setAmountText(text);
    edit();
  }
  async function send(allowDuplicate = false) {
    if (!canSend || check.amount == null) return;
    await rec.record(recordBody(draft, check.amount, ids), allowDuplicate);
  }

  const title = rec.result != null ? 'Payment recorded' : 'Record a payment';

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeLabel="Close"
      avoidKeyboard
      testID="record-sheet"
    >
      {rec.result != null ? (
        <Success result={rec.result} onDone={onClose} />
      ) : (
        <View style={styles.body}>
          <View style={styles.group}>
            <MandiText variant="captionEmphasis" muted>How much did they pay?</MandiText>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {fullAmount != null && (
                <Chip
                  testID="record-chip-full"
                  label={`Full ${formatMoney(fullAmount)}`}
                  active={mode === 'full'}
                  onPress={() => pickAmount('full', plainAmount(fullAmount))}
                />
              )}
              {hasOverdue && (
                <Chip
                  testID="record-chip-overdue"
                  label={`Overdue only ${formatMoney(overdue)}`}
                  active={mode === 'overdue'}
                  onPress={() => pickAmount('overdue', plainAmount(overdue))}
                />
              )}
              <Chip
                testID="record-chip-other"
                label="Other amount"
                active={mode === 'other'}
                onPress={() => pickAmount('other', '')}
              />
            </View>
            <MandiFormField
              label="Amount received"
              value={amountText}
              onChangeText={(next) => { setMode('other'); setAmountText(cleanAmountInput(next)); edit(); }}
              prefix="₹"
              keyboardType="decimal-pad"
              maxLength={16}
              required
              disabled={rec.pending}
              error={check.errors.amount ?? null}
              hint={targets.length > 1
                ? `Chosen: ${targets.map((t) => `${t.invoiceNumber} owes ${formatMoney(t.outstanding)}`).join(' · ')}`
                : undefined}
              testID="record-amount"
            />
          </View>

          <View style={styles.group}>
            <MandiText variant="captionEmphasis" muted>How did they pay?</MandiText>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {RECORD_METHODS.map((option) => {
                const active = option.value === method;
                return (
                  <Pressable
                    key={option.value}
                    testID={`record-method-${option.value}`}
                    onPress={() => { setMethod(option.value); edit(); }}
                    disabled={rec.pending}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: active, disabled: rec.pending }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <MethodIcon icon={option.icon} color={active ? Colors.primary : Colors.textSecondary} />
                    <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>
                      {option.label}
                    </MandiText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <MandiFormField
            label={REFERENCE_LABEL[method]}
            value={reference}
            onChangeText={(next) => { setReference(next); edit(); }}
            placeholder={referenceRequired(method) ? 'From the bank, UPI app or cheque' : 'If there is one'}
            autoCapitalize="characters"
            maxLength={80}
            required={referenceRequired(method)}
            disabled={rec.pending}
            error={reference.trim() === '' ? null : check.errors.reference ?? null}
            hint={reference.trim() === '' && referenceRequired(method) ? 'Required: 4 to 64 characters' : '4 to 64 characters'}
            testID="record-reference"
          />

          <View style={styles.group} testID="record-date">
            <MandiText variant="captionEmphasis" muted>Date received</MandiText>
            <View style={styles.dateRow}>
              <Pressable
                testID="record-date-prev"
                onPress={() => { setPaidOn((d) => shiftDay(d, -1)); edit(); }}
                disabled={rec.pending}
                accessibilityRole="button"
                accessibilityLabel="Previous day"
                accessibilityState={{ disabled: rec.pending }}
                style={styles.step}
              >
                <Ionicons name="chevron-back" size={IconSize.md} color={Colors.primary} />
              </Pressable>
              <MandiText variant="bodyEmphasis" style={styles.dateText} testID="record-date-text">{dayText}</MandiText>
              <Pressable
                testID="record-date-next"
                onPress={() => { setPaidOn((d) => (d < today ? shiftDay(d, 1) : d)); edit(); }}
                disabled={rec.pending || paidOn >= today}
                accessibilityRole="button"
                accessibilityLabel="Next day"
                accessibilityState={{ disabled: rec.pending || paidOn >= today }}
                style={styles.step}
              >
                <Ionicons name="chevron-forward" size={IconSize.md} color={Colors.primary} />
              </Pressable>
            </View>
            <View style={styles.chips}>
              <Chip testID="record-date-today" label="Today" active={paidOn === today}
                onPress={() => { setPaidOn(today); edit(); }} />
              <Chip testID="record-date-yesterday" label="Yesterday" active={paidOn === shiftDay(today, -1)}
                onPress={() => { setPaidOn(shiftDay(today, -1)); edit(); }} />
            </View>
            {check.errors.paidOn != null && (
              <MandiText variant="caption" color={Colors.danger} testID="record-date-error">{check.errors.paidOn}</MandiText>
            )}
          </View>

          <MandiFormField
            label="Note (optional)"
            value={note}
            onChangeText={(next) => { setNote(next); edit(); }}
            placeholder="Anything to remember about this payment"
            maxLength={500}
            multiline
            disabled={rec.pending}
            error={check.errors.note ?? null}
            testID="record-note"
          />

          <PreviewBlock
            visible={check.amount != null}
            loading={!previewCurrent || preview.isFetching}
            data={previewCurrent ? preview.data : undefined}
            refused={previewCurrent ? previewRefused : null}
            failed={previewCurrent && preview.isError && previewRefused == null}
            reviewable={reviewableInvoiceIds}
            onReviewClaim={onReviewClaim}
          />

          {rec.error?.kind === 'duplicate' ? (
            <View style={styles.warning} accessibilityLiveRegion="polite" testID="record-duplicate">
              <MandiText variant="bodyEmphasis">You may have recorded this already</MandiText>
              <MandiText variant="body" color={Colors.textSecondary}>
                {`${rec.error.text} Record it again only if this is a different payment.`}
              </MandiText>
              <MandiButton
                testID="record-anyway"
                label="Record anyway"
                variant="secondary"
                loading={rec.pending}
                disabled={rec.pending || offline}
                onPress={() => { void send(true); }}
              />
              <MandiButton
                testID="record-duplicate-back"
                label="Go back and check"
                variant="tertiary"
                disabled={rec.pending}
                onPress={edit}
              />
            </View>
          ) : rec.error != null ? (
            <View accessibilityLiveRegion="polite" testID="record-error">
              <MandiText variant="body" color={Colors.danger}>{rec.error.text}</MandiText>
            </View>
          ) : null}

          {offline && (
            <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to record this.</MandiText>
          )}
          {rec.error?.kind !== 'duplicate' && (
            <MandiButton
              testID="record-submit"
              label={check.amount != null ? `Record ${formatMoney(check.amount)} received` : 'Record payment'}
              loading={rec.pending}
              disabled={!canSend}
              onPress={() => { void send(); }}
            />
          )}
        </View>
      )}
    </MandiBottomSheet>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>{label}</MandiText>
    </Pressable>
  );
}

function PreviewBlock({
  visible, loading, data, refused, failed, reviewable, onReviewClaim,
}: {
  visible: boolean;
  loading: boolean;
  data: Parameters<typeof previewSummary>[0] | undefined;
  refused: ApiError | null;
  failed: boolean;
  reviewable: readonly number[];
  onReviewClaim?: (invoiceId: number) => void;
}) {
  if (!visible) return null;
  if (refused != null) {
    return (
      <View style={styles.warning} accessibilityLiveRegion="polite" testID="record-preview-refused">
        <MandiText variant="body" color={Colors.danger}>{refused.message}</MandiText>
      </View>
    );
  }
  if (data == null) {
    return (
      <View style={styles.preview} testID="record-preview">
        <MandiText variant="caption" color={Colors.textSecondary}>
          {failed ? "Couldn't preview this. You can still record it." : 'Checking what this does…'}
        </MandiText>
      </View>
    );
  }
  const summary = previewSummary(data);
  return (
    <View style={styles.preview} accessibilityLiveRegion="polite" testID="record-preview">
      {loading && <MandiText variant="caption" color={Colors.textTertiary}>Updating…</MandiText>}
      {summary.lines.map((line, i) => (
        <MandiText key={i} variant="body" testID={`record-preview-line-${i}`}>{line}</MandiText>
      ))}
      <MandiText variant="bodyEmphasis" testID="record-preview-after">{summary.after}</MandiText>
      {data.pendingClaims.map((c) => (
        <View key={c.invoiceId} style={styles.warning} accessibilityLiveRegion="polite" testID={`record-pending-claim-${c.invoiceId}`}>
          <MandiText variant="body">
            {`Your restaurant already told you they paid ${formatMoney(c.amount)} on ${c.invoiceNumber}. Confirm that claim instead?`}
          </MandiText>
          {onReviewClaim != null && reviewable.includes(c.invoiceId) && (
            <MandiButton
              testID={`record-review-claim-${c.invoiceId}`}
              label="Review that claim"
              variant="secondary"
              size="md"
              onPress={() => onReviewClaim(c.invoiceId)}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function Success({ result, onDone }: { result: NonNullable<ReturnType<typeof useRecordPayment>['result']>; onDone: () => void }) {
  const summary = receiptSummary(result);
  return (
    <View style={styles.body} testID="record-success">
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={IconSize.xl} color={Colors.success} />
        <MandiText variant="bodyEmphasis" style={styles.flex}>{`${formatMoney(result.amount)} recorded`}</MandiText>
      </View>
      {summary.lines.map((line, i) => (
        <MandiText key={i} variant="body">{line}</MandiText>
      ))}
      <MandiText variant="bodyEmphasis" testID="record-success-after">{summary.after}</MandiText>
      <MandiButton testID="record-done" label="Done" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  group: { gap: Spacing.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TARGET,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dateText: { flex: 1, textAlign: 'center' },
  step: {
    minWidth: TARGET,
    minHeight: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  preview: { gap: Spacing.xs, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surfaceSunken },
  warning: { gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.warningLight },
});
