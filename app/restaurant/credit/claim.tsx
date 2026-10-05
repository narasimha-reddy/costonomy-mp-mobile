import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSubmitClaim, type ClaimError } from '@/hooks/useSubmitClaim';
import { fetchAgreement, fetchInvoices } from '@/services/credit';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
} from '@/components/common';
import {
  CLAIM_METHODS,
  checkClaim,
  claimMethodLabel,
  istDay,
  issuedDay,
  referenceRequired,
  shiftDay,
} from '@/lib/credit/claims';
import { splitInvoices, type CreditInvoiceListItem } from '@/lib/credit/invoices';
import { scaledToAmount, toScaled } from '@/lib/wallet/amount';
import type { ClaimMethod } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

function overpaymentText(outstanding: number): string {
  return `You can report up to ${formatMoney(outstanding)} more on this invoice (other reports are waiting for your supplier).`;
}

const STATE_TEXT = 'This invoice changed. Go back and try again.';

function errorText(error: ClaimError): string {
  switch (error.kind) {
    case 'overpayment': return overpaymentText(error.outstanding);
    case 'state': return STATE_TEXT;
    case 'invalid': return error.message;
    default: return "Couldn't send that. Check your connection and try again.";
  }
}

/** The server's still-owed figure as the two-decimal text the amount field takes. */
function prefill(outstanding: string | number): string {
  const scaled = toScaled(outstanding, 4);
  return scaled == null ? '' : scaledToAmount(scaled);
}

/**
 * "I paid outside the app": tell a supplier a repayment was made directly (bank,
 * cash, cheque, UPI or card).
 *
 * <p>It changes nothing that is owed until the supplier confirms it, and the screen
 * says so. The server sends every amount; this only parses what the person types.
 *
 * <p>No date picker exists in the app (the date filters take typed days), so the
 * day is a stepper: back one day, forward one day (never past today in India), and
 * a "Today" shortcut.
 */
export default function CreditClaimScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { offline } = useNetworkStatus();
  const params = useLocalSearchParams<{ agreementId?: string | string[]; invoiceId?: string | string[] }>();
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const agreementId = Number(first(params.agreementId));
  const rawInvoice = first(params.invoiceId);
  const presetInvoiceId = rawInvoice != null && rawInvoice !== '' ? Number(rawInvoice) : null;

  const agreement = useQuery({
    queryKey: ['credit-agreement', agreementId],
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });
  const invoices = useQuery({
    queryKey: ['outlet', outletId, 'credit', 'agreement', agreementId, 'invoices'],
    queryFn: () => fetchInvoices(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });

  const supplierName = agreement.data?.supplierName ?? agreement.data?.storeName ?? 'your supplier';
  const claim = useSubmitClaim({ agreementId, supplierName });

  const open = useMemo(
    () => splitInvoices((invoices.data ?? []) as CreditInvoiceListItem[]).open,
    [invoices.data],
  );
  const [pickedId, setPickedId] = useState<number | null>(null);
  // The first overdue, else the oldest due: `open` is already in that order.
  const selectedId = presetInvoiceId ?? pickedId ?? open[0]?.id ?? null;
  const invoice = open.find((i) => i.id === selectedId) ?? null;

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<ClaimMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(() => istDay());
  const [note, setNote] = useState('');

  // Fill the amount with what the server says is still owed, once per invoice.
  const prefilledFor = useRef<number | null>(null);
  useEffect(() => {
    if (invoice != null && prefilledFor.current !== invoice.id) {
      prefilledFor.current = invoice.id;
      setAmountText(prefill(invoice.outstanding));
    }
  }, [invoice]);

  const today = istDay();
  const issuedOn = issuedDay(invoice?.issuedAt);
  const check = checkClaim({ amountText, method, reference, paidOn, note }, today, issuedOn);
  const needsReference = referenceRequired(method);
  const referenceMissing = needsReference && reference.trim() === '';
  const canSend = invoice != null && check.valid && !claim.pending && !offline;

  const goBack = () => (router.canGoBack?.() === false ? router.replace('/restaurant/credit') : router.back());

  async function submit() {
    if (!canSend || check.amount == null || invoice == null) return;
    const trimmedReference = reference.trim();
    const trimmedNote = note.trim();
    const response = await claim.send(invoice.id, {
      amount: Number(check.amount),
      method,
      ...(trimmedReference !== '' ? { reference: trimmedReference } : {}),
      paidOn,
      ...(trimmedNote !== '' ? { note: trimmedNote } : {}),
    });
    if (response != null) goBack();
  }

  const header = <MandiHeader title="I paid outside the app" subtitle={agreement.data?.supplierName ?? undefined} back />;

  if (!Number.isFinite(agreementId)) {
    return (
      <MandiScreen header={header}>
        <MandiEmptyState icon="document-text-outline" title="Nothing to report here" actionLabel="Go back" onAction={goBack} />
      </MandiScreen>
    );
  }

  if (invoices.isPending || agreement.isPending) {
    return <MandiScreen header={header}><MandiSkeletonList count={3} /></MandiScreen>;
  }

  if (invoices.error || agreement.error) {
    return (
      <MandiScreen header={header}>
        <MandiErrorState
          message="Couldn't load this invoice."
          onRetry={() => { void invoices.refetch(); void agreement.refetch(); }}
          retrying={invoices.isFetching}
          testID="claim-load-error"
        />
      </MandiScreen>
    );
  }

  // After a refused send the invoice may have just left the open list: keep the form so the message stays.
  if ((open.length === 0 || (presetInvoiceId != null && invoice == null)) && claim.error == null) {
    return (
      <MandiScreen header={header}>
        <MandiEmptyState
          icon="checkmark-circle-outline"
          title={presetInvoiceId != null ? 'Nothing is owed on this invoice' : 'No open invoices'}
          description="There is nothing to report here."
          actionLabel="Go back"
          onAction={goBack}
          testID="claim-nothing-owed"
        />
      </MandiScreen>
    );
  }

  const sendLabel = claim.pending ? 'Sending…' : 'Send to supplier';

  return (
    <MandiScreen
      header={header}
      footer={(
        <MandiStickyBar>
          {claim.error != null && (
            <View style={styles.note} accessibilityLiveRegion="polite" testID={`claim-error-${claim.error.kind}`}>
              <MandiText variant="body" color={Colors.danger}>{errorText(claim.error)}</MandiText>
              {claim.error.kind === 'retry' && (
                <MandiButton
                  testID="claim-retry"
                  variant="secondary"
                  label="Retry"
                  icon="refresh"
                  disabled={!canSend}
                  onPress={() => { void submit(); }}
                />
              )}
            </View>
          )}
          <MandiButton
            testID="claim-send"
            label={sendLabel}
            fullWidth
            loading={claim.pending}
            disabled={!canSend}
            onPress={() => { void submit(); }}
          />
          {offline && (
            <MandiText variant="caption" color={Colors.textSecondary}>Reconnect to send this.</MandiText>
          )}
        </MandiStickyBar>
      )}
    >
      <MandiOfflineBanner visible={offline} />

      <MandiCard testID="claim-explainer">
        <MandiText variant="body" testID="claim-explainer-text">
          Your supplier will confirm this. Until then it still shows as owed.
        </MandiText>
      </MandiCard>

      {presetInvoiceId == null ? (
        <View style={styles.section}>
          <MandiSectionHeader title="Which invoice?" />
          <View accessibilityRole="radiogroup" style={styles.section}>
            {open.map((row) => (
              <CreditInvoiceRow
                key={row.id}
                invoice={row}
                selected={row.id === selectedId}
                onPress={() => { setPickedId(row.id); claim.reset(); }}
              />
            ))}
          </View>
        </View>
      ) : invoice != null ? (
        <View style={styles.section} testID="claim-invoice">
          <MandiSectionHeader title="Invoice" />
          <CreditInvoiceRow invoice={invoice} />
        </View>
      ) : null}

      <MandiFormField
        label="Amount"
        value={amountText}
        onChangeText={(next) => { setAmountText(next.replace(/[^\d.]/g, '')); claim.reset(); }}
        placeholder="0"
        prefix="₹"
        keyboardType="decimal-pad"
        maxLength={12}
        disabled={claim.pending}
        error={check.errors.amount ?? null}
        hint={invoice != null ? `Still owed on this invoice: ${formatMoney(invoice.outstanding)}` : undefined}
        required
        testID="claim-amount"
      />

      <View style={styles.section}>
        <MandiText variant="captionEmphasis" muted>How did you pay?</MandiText>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {CLAIM_METHODS.map((option) => {
            const active = option === method;
            return (
              <Pressable
                key={option}
                testID={`claim-method-${option}`}
                onPress={() => { setMethod(option); claim.reset(); }}
                disabled={claim.pending}
                accessibilityRole="radio"
                accessibilityLabel={claimMethodLabel(option)}
                accessibilityState={{ selected: active, disabled: claim.pending }}
                style={[styles.chip, active && styles.chipActive]}
              >
                {active && <Ionicons name="checkmark" size={IconSize.sm} color={Colors.primary} />}
                <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>
                  {claimMethodLabel(option)}
                </MandiText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <MandiFormField
        label="UTR / reference number"
        value={reference}
        onChangeText={(next) => { setReference(next); claim.reset(); }}
        placeholder={needsReference ? 'From your bank or UPI app' : 'Optional for cash'}
        autoCapitalize="characters"
        maxLength={200}
        disabled={claim.pending}
        hint={needsReference ? (referenceMissing ? 'Required' : undefined) : 'Optional for cash'}
        required={needsReference}
        testID="claim-reference"
      />

      <View style={styles.section} testID="claim-date">
        <MandiText variant="captionEmphasis" muted>Date paid</MandiText>
        <View style={styles.dateRow}>
          <Pressable
            testID="claim-date-prev"
            onPress={() => { setPaidOn((d) => shiftDay(d, -1)); claim.reset(); }}
            disabled={claim.pending || (issuedOn != null && paidOn <= issuedOn)}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            accessibilityState={{ disabled: claim.pending || (issuedOn != null && paidOn <= issuedOn) }}
            style={styles.step}
          >
            <Ionicons name="chevron-back" size={IconSize.md} color={Colors.primary} />
          </Pressable>
          <MandiText variant="bodyEmphasis" style={styles.dateText} testID="claim-date-text">
            {formatDay(paidOn) ?? paidOn}
          </MandiText>
          <Pressable
            testID="claim-date-next"
            onPress={() => { setPaidOn((d) => (d < today ? shiftDay(d, 1) : d)); claim.reset(); }}
            disabled={claim.pending || paidOn >= today}
            accessibilityRole="button"
            accessibilityLabel="Next day"
            accessibilityState={{ disabled: claim.pending || paidOn >= today }}
            style={styles.step}
          >
            <Ionicons name="chevron-forward" size={IconSize.md} color={Colors.primary} />
          </Pressable>
        </View>
        {paidOn !== today && (
          <MandiButton
            testID="claim-date-today"
            label="Today"
            variant="tertiary"
            size="sm"
            onPress={() => { setPaidOn(today); claim.reset(); }}
          />
        )}
        {check.errors.paidOn != null && (
          <MandiText variant="caption" color={Colors.danger} testID="claim-date-error">
            {check.errors.paidOn}
          </MandiText>
        )}
      </View>

      <MandiFormField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Anything your supplier should know"
        maxLength={500}
        multiline
        disabled={claim.pending}
        testID="claim-note"
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  note: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dateText: { flex: 1, textAlign: 'center' },
  step: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
