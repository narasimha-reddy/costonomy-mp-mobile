import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePayFromWallet, type PayError } from '@/hooks/usePayFromWallet';
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
  invoice?: { id: number; invoiceNumber: string; outstanding: Money | number };
  onPaid: (response: WalletRepayment) => void;
}

const MIN_SCALED = 10_000; // ₹1.00

/** A server amount as the two-decimal string the API takes, or null if it is below ₹1. */
function amountOf(value: Money | number): string | null {
  const scaled = toScaled(value, 4);
  return scaled == null || scaled < MIN_SCALED ? null : scaledToAmount(scaled);
}

/** What the person typed: valid only at ₹1.00 or more with at most 2 decimals. */
function typedAmount(text: string): { amount: string | null; message: string | null } {
  if (text.trim() === '') return { amount: null, message: null };
  const scaled = toScaled(text, 2);
  if (scaled == null) return { amount: null, message: 'Use at most 2 decimal places.' };
  if (scaled < MIN_SCALED) return { amount: null, message: 'Enter at least ₹1.00.' };
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
  visible, onClose, agreementId, supplierName, due, overdue, invoice, onPaid,
}: PayFromWalletSheetProps) {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { offline } = useNetworkStatus();
  const hasOverdue = invoice == null && isPositive(overdue);
  const defaultChoice: Choice = hasOverdue ? 'overdue' : 'full';

  const [choice, setChoice] = useState<Choice>(defaultChoice);
  const [text, setText] = useState('');
  const payment = usePayFromWallet({ agreementId, supplierName, invoiceId: invoice?.id });

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

  const fullValue = invoice != null ? invoice.outstanding : due;
  const typed = typedAmount(text);
  const amount = choice === 'full' ? amountOf(fullValue)
    : choice === 'overdue' ? amountOf(overdue) : typed.amount;
  const canPay = amount != null && !payment.pending && !offline;

  function select(next: Choice) {
    setChoice(next);
    payment.reset();
  }

  async function submit() {
    if (amount == null || offline) return;
    const response = await payment.pay(amount);
    if (response != null) {
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
            disabled={payment.pending}
            error={typed.message}
            testID="other-amount"
          />
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

        <MandiButton
          testID="pay-button"
          variant="primary"
          label={amount != null ? `Pay ${formatMoney(amount)} from wallet` : 'Pay from wallet'}
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
    : "Paying credit from your wallet isn't available yet.";
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
