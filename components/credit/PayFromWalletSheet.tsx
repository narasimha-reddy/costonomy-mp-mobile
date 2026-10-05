import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { SIGN_IN_AGAIN_TEXT, idempotencyText, usePayFromWallet, type PayError } from '@/hooks/usePayFromWallet';
import { PAY_ANYWAY_LABEL, doublePayWarning, overlapsWaitingReports } from '@/lib/credit/doublePay';
import { DoublePayWarning } from './DoublePayWarning';
import { sameAmount, sliverLeft } from '@/lib/credit/sum';
import { walletKey } from '@/lib/queryKeys';
import { scaledToAmount, toScaled } from '@/lib/wallet/amount';
import type { WalletRepayment } from '@/models/credit';
import { fetchWallet } from '@/services/wallet';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

type Choice = 'full' | 'overdue' | 'other';

export interface PayFromWalletSheetProps {
  visible: boolean;
  onClose: () => void;
  agreementId: number;
  supplierName: string;
  /** What is owed to this supplier, from the server. */
  due: Money | number;
  /** The overdue part of it, from the server. May be 0. */
  overdue: Money | number;
  /** Set when paying a single invoice from its own screen. */
  invoice?: {
    id: number;
    invoiceNumber: string;
    outstanding: Money | number;
    /** What can still be reported on this invoice (server). Absent: no double-pay warning. */
    reportableAmount?: Money | number;
    /** The sum of this invoice's reports waiting for the supplier (display only). */
    waitingAmount?: Money | number;
  };
  /** Reports waiting for the supplier, whole agreement (server). Absent: no double-pay warning. */
  openClaimsAmount?: Money | number;
  /** What can still be reported on the agreement: owed minus waiting reports (server). */
  reportableAmount?: Money | number;
  onPaid: (response: WalletRepayment) => void;
}

const MIN_SCALED = 10_000; // ₹1.00

/**
 * A server amount as the two-decimal string the API takes, or null if there is
 * less than a paisa. A balance below ₹1 IS payable here: the server accepts a
 * payment under ₹1 only when it clears exactly what it targets.
 */
function amountOf(value: Money | number): string | null {
  const scaled = toScaled(value, 4);
  return scaled == null || scaled < 100 ? null : scaledToAmount(scaled);
}

/**
 * What the person typed: valid at ₹1.00 or more with at most 2 decimals, or below
 * ₹1 only when it is exactly `exact` (what a full payment would be).
 */
function typedAmount(text: string, exact: Money | number): { amount: string | null; message: string | null } {
  if (text.trim() === '') return { amount: null, message: null };
  const scaled = toScaled(text, 2);
  if (scaled == null) return { amount: null, message: 'Use at most 2 decimal places.' };
  if (scaled < MIN_SCALED && !(scaled > 0 && sameAmount(text, exact))) {
    return { amount: null, message: 'Enter at least ₹1.00.' };
  }
  return { amount: scaledToAmount(scaled), message: null };
}

function isPositive(value: Money | number): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Pay a supplier's credit from the restaurant's own wallet.
 *
 * <p>Presentational: the request, its idempotency key, the refreshes and the
 * success toast live in `usePayFromWallet`. The amounts offered are the ones the
 * server sent; the server decides which invoices an amount settles.
 */
export function PayFromWalletSheet({
  visible, onClose, agreementId, supplierName, due, overdue, invoice, openClaimsAmount, reportableAmount, onPaid,
}: PayFromWalletSheetProps) {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { offline } = useNetworkStatus();
  const hasOverdue = invoice == null && isPositive(overdue);
  const defaultChoice: Choice = hasOverdue ? 'overdue' : 'full';

  const [choice, setChoice] = useState<Choice>(defaultChoice);
  const [text, setText] = useState('');
  const fullValue = invoice != null ? invoice.outstanding : due;
  // What was on screen when an attempt was made: a held key is reused only while it is unchanged.
  const stamp = invoice != null ? `${invoice.outstanding}` : `${due}|${overdue}`;
  const payment = usePayFromWallet({ agreementId, supplierName, invoiceId: invoice?.id, stamp });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const wallet = useQuery({
    queryKey: walletKey(outletId),
    queryFn: () => fetchWallet(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  // Coming back from Add money: show the balance as it now is.
  const refetchWallet = wallet.refetch;
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setChoice(defaultChoice);
      setText('');
      if (wallet.data != null) void refetchWallet();
    }
    wasVisible.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const typed = typedAmount(text, fullValue);
  const amount = choice === 'full' ? amountOf(fullValue)
    : choice === 'overdue' ? amountOf(overdue) : typed.amount;
  const waiting = invoice != null ? invoice.waitingAmount : openClaimsAmount;
  const reportable = invoice != null ? invoice.reportableAmount : reportableAmount;
  const overlap = amount != null && overlapsWaitingReports(waiting, reportable, amount);
  const canPay = amount != null && !payment.pending && !payment.checking && !offline;
  // A part payment that leaves a sliver under ₹1 cannot be topped up later: offer the whole.
  const sliver = choice === 'other' && amount != null ? sliverLeft(fullValue, amount) : null;

  function select(next: Choice) {
    setChoice(next);
    if (next !== 'other') Keyboard.dismiss();
    payment.reset();
  }

  async function submit() {
    if (amount == null || offline) return;
    const response = await payment.pay(amount);
    if (response != null && mounted.current) {
      onClose();
      onPaid(response);
    }
  }

  function addMoney() {
    onClose();
    router.push('/restaurant/wallet/add-money');
  }

  const options: { id: Choice; label: string }[] = invoice != null
    ? [
      { id: 'full', label: `Full ${formatMoney(invoice.outstanding)}` },
      { id: 'other', label: 'Other amount' },
    ]
    : [
      { id: 'full', label: `Full due ${formatMoney(due)}` },
      ...(hasOverdue ? [{ id: 'overdue' as const, label: `Overdue only ${formatMoney(overdue)}` }] : []),
      { id: 'other', label: 'Other amount' },
    ];

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title={`Pay ${supplierName}`}
      closeLabel="Close"
      avoidKeyboard
      testID="pay-from-wallet-sheet"
    >
      <View style={styles.body}>
        <MandiText variant="caption" color={Colors.textSecondary} testID="wallet-balance">
          {wallet.data != null
            ? `Wallet balance ${formatMoney(wallet.data.balance)}`
            : wallet.isPending ? 'Wallet balance …' : ''}
        </MandiText>

        <View accessibilityRole="radiogroup" style={styles.options}>
          {options.map((option) => {
            const selected = choice === option.id;
            return (
              <Pressable
                key={option.id}
                testID={`choice-${option.id}`}
                onPress={() => select(option.id)}
                disabled={payment.pending}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected, disabled: payment.pending }}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selected ? Colors.primary : Colors.textTertiary}
                />
                <MandiText variant="bodyEmphasis">{option.label}</MandiText>
              </Pressable>
            );
          })}
        </View>

        {choice === 'other' && (
          <MandiFormField
            label="Amount"
            value={text}
            onChangeText={(next) => { setText(next.replace(/[^\d.]/g, '')); payment.reset(); }}
            placeholder="0"
            prefix="₹"
            keyboardType="decimal-pad"
            maxLength={12}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            disabled={payment.pending}
            error={typed.message}
            testID="other-amount"
          />
        )}

        {sliver != null && (
          <View style={styles.note} accessibilityLiveRegion="polite" testID="sliver-hint">
            <MandiText variant="body" color={Colors.textSecondary}>
              {`This would leave ${formatMoney(sliver)} owed. Pay the full ${formatMoney(fullValue)} instead?`}
            </MandiText>
            <MandiButton
              testID="pay-full-instead"
              variant="secondary"
              label="Pay full amount"
              onPress={() => select('full')}
            />
          </View>
        )}

        <MandiText variant="caption" color={Colors.textSecondary}>
          {invoice != null
            ? `This pays invoice ${invoice.invoiceNumber}.`
            : 'We settle the oldest invoices first. Your supplier gets this in their next payout.'}
        </MandiText>

        {payment.error != null && (
          <ErrorNote
            error={payment.error}
            onAddMoney={addMoney}
            onRetry={() => { void submit(); }}
          />
        )}

        {overlap && <DoublePayWarning text={doublePayWarning(waiting)} />}

        <MandiButton
          testID="pay-button"
          variant="primary"
          label={amount != null
            ? (overlap ? PAY_ANYWAY_LABEL(amount) : `Pay ${formatMoney(amount)} from wallet`)
            : 'Pay from wallet'}
          loading={payment.pending}
          disabled={!canPay}
          onPress={() => { void submit(); }}
        />
      </View>
    </MandiBottomSheet>
  );
}

function ErrorNote({
  error, onAddMoney, onRetry,
}: { error: PayError; onAddMoney: () => void; onRetry: () => void }) {
  if (error.kind === 'short') {
    return (
      <View style={styles.note} accessibilityLiveRegion="polite" testID="pay-error-short">
        <MandiText variant="bodyEmphasis" color={Colors.danger}>
          {`You're ${formatMoney(error.shortBy)} short`}
        </MandiText>
        <MandiButton testID="add-money" variant="secondary" label="Add money" onPress={onAddMoney} />
      </View>
    );
  }
  if (error.kind === 'other') {
    return (
      <View style={styles.note} accessibilityLiveRegion="polite" testID="pay-error-other">
        <MandiText variant="body" color={Colors.danger}>{error.message}</MandiText>
        <MandiButton testID="retry" variant="secondary" label="Retry" icon="refresh" onPress={onRetry} />
      </View>
    );
  }
  const message = error.kind === 'overpayment'
    ? `That's more than the ${formatMoney(error.outstanding)} you owe.`
    : error.kind === 'hold' ? 'Your wallet is on hold. Please contact support.'
      : error.kind === 'auth' ? SIGN_IN_AGAIN_TEXT
        : error.kind === 'forbidden' ? "Paying credit from your wallet isn't available yet."
          : idempotencyText(error.kind);
  return (
    <View style={styles.note} accessibilityLiveRegion="polite" testID={`pay-error-${error.kind}`}>
      <MandiText variant="body" color={Colors.danger}>{message}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingTop: Spacing.sm },
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
  note: { gap: Spacing.sm },
});
