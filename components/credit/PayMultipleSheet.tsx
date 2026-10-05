import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiText } from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePayMultiple, type PayItem, type PayItemResult } from '@/hooks/usePayMultiple';
import { SIGN_IN_AGAIN_TEXT, idempotencyText, type PayError } from '@/hooks/usePayFromWallet';
import { agreementName } from '@/lib/credit/overview';
import { PAY_ANYWAY_LABEL, doublePayWarning, overlapsWaitingReports } from '@/lib/credit/doublePay';
import { DoublePayWarning } from './DoublePayWarning';
import { sumAmounts } from '@/lib/credit/sum';
import { walletKey } from '@/lib/queryKeys';
import { scaledToAmount, toScaled } from '@/lib/wallet/amount';
import type { CreditAgreement } from '@/models/credit';
import { fetchWallet } from '@/services/wallet';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * A server amount as the two-decimal string the API takes, or null below a paisa.
 * A supplier's total below ₹1 is selectable: the server takes a sub-₹1 payment
 * only when it clears exactly what it targets, and this is exactly that.
 */
function amountOf(value: Money | number): string | null {
  const scaled = toScaled(value, 4);
  return scaled == null || scaled < 100 ? null : scaledToAmount(scaled);
}

interface Row {
  agreement: CreditAgreement;
  name: string;
  overdue: boolean;
  amount: string | null;
  /** Reports waiting for the supplier, when the server said so and there are any. */
  waiting: Money | number | null;
  overlaps: boolean;
}

function rowOf(agreement: CreditAgreement): Row {
  const overdue = Number(agreement.overdue) > 0;
  const amount = amountOf(overdue ? agreement.overdue : agreement.due);
  const waiting = Number(agreement.openClaimsAmount) > 0 ? (agreement.openClaimsAmount as Money) : null;
  return {
    agreement,
    name: agreementName(agreement),
    overdue,
    amount,
    waiting,
    overlaps: amount != null && overlapsWaitingReports(agreement.openClaimsAmount, agreement.reportableAmount, amount),
  };
}

function reasonOf(error: PayError): string {
  switch (error.kind) {
    case 'short': return `Wallet is ${formatMoney(error.shortBy)} short`;
    case 'overpayment': return 'You owe less than that now';
    case 'forbidden': return 'Not available yet';
    case 'hold': return 'Your wallet is on hold. Please contact support.';
    case 'auth': return SIGN_IN_AGAIN_TEXT;
    case 'reuse': case 'processing': case 'failed': return idempotencyText(error.kind);
    default: return error.message;
  }
}

export interface PayMultipleSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Suppliers owed money, already sorted overdue first. */
  agreements: CreditAgreement[];
  /** "Pay one supplier instead": the caller opens the single-supplier path. */
  onPayOne: () => void;
}

/**
 * Pay several suppliers' overdue amounts from the wallet in one go.
 *
 * <p>Each supplier is still its own repayment (see `usePayMultiple`); the total
 * shown is display only and is never sent. Overdue suppliers start checked at
 * their overdue amount; the others can be added at their full due.
 */
export function PayMultipleSheet({ visible, onClose, agreements, onPayOne }: PayMultipleSheetProps) {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { offline } = useNetworkStatus();
  const rows = agreements.map(rowOf);

  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(rows.filter((r) => r.overdue && r.amount != null).map((r) => r.agreement.id)));
  const [attempted, setAttempted] = useState<PayItem[] | null>(null);
  const [balanceAfter, setBalanceAfter] = useState<Money | number | null>(null);
  const payment = usePayMultiple();
  const lastRun = useRef(0);

  const wallet = useQuery({
    queryKey: walletKey(outletId),
    queryFn: () => fetchWallet(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const selectedRows = rows.filter((r) => checked.has(r.agreement.id) && r.amount != null);
  const total = sumAmounts(selectedRows.map((r) => r.amount as string));
  const overlapping = selectedRows.filter((r) => r.overlaps);
  const canPay = selectedRows.length > 0 && total != null && !payment.running && !payment.checking && !offline;

  function toggle(id: number) {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runItems(items: PayItem[]) {
    const run = ++lastRun.current;
    const out = await payment.run(items);
    if (run !== lastRun.current) return;
    for (const item of items) {
      const result = out[item.agreementId];
      if (result?.status === 'paid') setBalanceAfter(result.response.walletBalanceAfter);
    }
  }

  function pay() {
    if (!canPay) return;
    const items: PayItem[] = selectedRows.map((r) => ({
      agreementId: r.agreement.id, supplierName: r.name, amount: r.amount as string,
      stamp: `${r.agreement.due}|${r.agreement.overdue}`,
    }));
    setAttempted(items);
    void runItems(items);
  }

  function tryAgain() {
    if (attempted == null || offline || payment.checking) return;
    const failed = attempted.filter((i) => payment.results[i.agreementId]?.status === 'failed');
    if (failed.length > 0) void runItems(failed);
  }

  function addMoney() {
    onClose();
    router.push('/restaurant/wallet/add-money');
  }

  const guardedClose = () => { if (!payment.running) onClose(); };

  const answered = attempted != null
    && attempted.every((i) => payment.results[i.agreementId] != null)
    && !payment.running;
  const paidCount = attempted?.filter((i) => payment.results[i.agreementId]?.status === 'paid').length ?? 0;
  const anyFailed = attempted != null && paidCount < attempted.length;

  const walletLine = wallet.data != null
    ? `Wallet ${formatMoney(wallet.data.balance)}`
    : wallet.isPending ? 'Wallet …' : '';

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={guardedClose}
      title={attempted == null ? 'Pay overdue to'
        : !answered ? 'Paying…'
          : paidCount === 0 ? 'Nothing was paid' : `Paid ${paidCount} of ${attempted.length}`}
      closeLabel="Close"
      testID="pay-multiple-sheet"
    >
      {attempted == null ? (
        <View style={styles.body}>
          {!rows.some((r) => r.overdue) && (
            <MandiText variant="body" color={Colors.textSecondary} testID="multi-nothing-overdue">
              Nothing is overdue. Tick the suppliers you want to pay.
            </MandiText>
          )}
          {/* Only the supplier list scrolls; the total, the wallet line and the Pay
              buttons below it stay on screen however many suppliers are owed. */}
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} testID="multi-list">
            {rows.map((r) => {
              const on = checked.has(r.agreement.id);
              const disabled = r.amount == null;
              return (
                <Pressable
                  key={r.agreement.id}
                  testID={`multi-row-${r.agreement.id}`}
                  onPress={() => toggle(r.agreement.id)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${r.name}, ${formatMoney(r.amount ?? r.agreement.due)}${r.overdue ? ' overdue' : ', not overdue'}`}
                  accessibilityState={{ checked: on, disabled }}
                  style={styles.row}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={IconSize.lg}
                    color={on ? Colors.primary : Colors.textTertiary}
                  />
                  <View style={styles.flex}>
                    <MandiText variant="bodyEmphasis" numberOfLines={1}>{r.name}</MandiText>
                    {r.overdue ? (
                      <MandiText variant="captionEmphasis" color={Colors.danger}>Overdue</MandiText>
                    ) : (
                      <MandiText variant="caption" color={Colors.textSecondary}>not overdue</MandiText>
                    )}
                    {r.waiting != null && (
                      <MandiText variant="caption" color={Colors.textSecondary} testID={`multi-waiting-${r.agreement.id}`}>
                        {`${formatMoney(r.waiting)} reported, waiting for supplier`}
                      </MandiText>
                    )}
                  </View>
                  <MandiText variant="bodyEmphasis">{formatMoney(r.amount ?? r.agreement.due)}</MandiText>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.totals}>
            <MandiText variant="caption" color={Colors.textSecondary} testID="multi-wallet">
              {walletLine}
            </MandiText>
            <MandiText variant="bodyEmphasis" testID="multi-total">
              {`Total ${formatMoney(total ?? 0)}`}
            </MandiText>
          </View>

          {overlapping.length > 0 && (
            <DoublePayWarning
              testID="multi-double-pay-warning"
              text={overlapping.length === 1 && overlapping[0] != null
                ? `${doublePayWarning(overlapping[0].waiting)} (${overlapping[0].name})`
                : `You reported payments outside the app to ${overlapping.map((r) => r.name).join(', ')} that they haven't confirmed yet. If you also pay from your wallet, you may pay twice.`}
            />
          )}

          <MandiButton
            testID="multi-pay"
            variant="primary"
            label={selectedRows.length > 0 && total != null
              ? (overlapping.length > 0 ? PAY_ANYWAY_LABEL(total) : `Pay ${formatMoney(total)} from wallet`)
              : 'Pay from wallet'}
            disabled={!canPay}
            loading={payment.running}
            onPress={pay}
          />
          <MandiButton
            testID="multi-one-instead"
            variant="tertiary"
            label="Pay one supplier instead"
            disabled={payment.running}
            onPress={onPayOne}
          />
        </View>
      ) : (
        <View style={styles.body}>
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} accessibilityLiveRegion="polite" testID="multi-results">
            {attempted.map((item) => {
              const result: PayItemResult | undefined = payment.results[item.agreementId];
              return (
                <ResultRow
                  key={item.agreementId}
                  item={item}
                  result={result}
                  onAddMoney={addMoney}
                />
              );
            })}
          </ScrollView>
          {paidCount > 0 && balanceAfter != null && (
            <MandiText variant="caption" color={Colors.textSecondary} testID="multi-balance-now">
              {`Wallet balance now ${formatMoney(balanceAfter)}`}
            </MandiText>
          )}
          {anyFailed && (
            <MandiButton
              testID="multi-retry"
              variant="secondary"
              icon="refresh"
              label="Try again"
              disabled={!answered || offline || payment.checking}
              loading={payment.running}
              onPress={tryAgain}
            />
          )}
          <MandiButton
            testID="multi-done"
            variant={anyFailed ? 'tertiary' : 'primary'}
            label="Done"
            disabled={payment.running}
            onPress={onClose}
          />
        </View>
      )}
    </MandiBottomSheet>
  );
}

function ResultRow({
  item, result, onAddMoney,
}: { item: PayItem; result: PayItemResult | undefined; onAddMoney: () => void }) {
  const base = `multi-result-${item.agreementId}`;
  if (result == null) {
    // No answer yet: say nothing that sounds like an outcome.
    return (
      <View style={styles.row} testID={base}>
        <Ionicons name="time-outline" size={IconSize.lg} color={Colors.textTertiary} />
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis" numberOfLines={1}>{item.supplierName}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>Waiting for the answer</MandiText>
        </View>
      </View>
    );
  }
  if (result.status === 'paid') {
    return (
      <View style={styles.row} testID={base}>
        <Ionicons name="checkmark-circle" size={IconSize.lg} color={Colors.success} />
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis" numberOfLines={1}>{item.supplierName}</MandiText>
          <MandiText variant="caption" color={Colors.success}>
            {`Paid ${formatMoney(result.response.amount)}`}
          </MandiText>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row} testID={base}>
      <Ionicons name="close-circle" size={IconSize.lg} color={Colors.danger} />
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{item.supplierName}</MandiText>
        <MandiText variant="caption" color={Colors.danger}>
          {`Not paid: ${reasonOf(result.error)}`}
        </MandiText>
        {result.error.kind === 'short' && (
          <MandiButton
            testID={`multi-add-money-${item.agreementId}`}
            variant="secondary"
            size="sm"
            label="Add money"
            onPress={onAddMoney}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingTop: Spacing.sm, flexShrink: 1 },
  listScroll: { flexGrow: 0, flexShrink: 1 },
  list: { gap: Spacing.sm },
  flex: { flex: 1, gap: Spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totals: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
});
