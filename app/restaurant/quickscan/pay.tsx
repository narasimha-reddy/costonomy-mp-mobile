import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { createQuickScanPayment, fetchQuickScanConfig } from '@/services/quickscan';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { usePermissions } from '@/hooks/usePermissions';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { isAmount } from '@/lib/disputes/refundCopy';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import type { QuickScanMethodOption } from '@/models/quickscan';
import { Colors, Radius, Spacing } from '@/theme';
import { radioProps } from '@/lib/a11y';

const SCREEN = 'REST-QUICKSCAN-02';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function methodLabel(option: QuickScanMethodOption): string {
  return option.method === 'WALLET' ? 'Pay from wallet' : 'Pay by UPI';
}

/**
 * REST-QUICKSCAN-02. What comes back from {@link fetchQuickScanConfig} is the
 * only thing this screen trusts about money: the fee, the wallet balance and
 * whether each method can be used. The amount is the person's own figure — set
 * by the QR they scanned, or typed here — never something computed against the
 * fee, which the server adds on its own.
 *
 * <p><b>Only wallet is payable today.</b> `POST .../payments` takes `method:
 * "WALLET"` alone; "Pay by UPI" is shown, per the config, so a restaurant knows
 * it exists and why it can't be used yet rather than wondering where it went.
 */
export default function QuickScanPayScreen() {
  const params = useLocalSearchParams<{
    vpa?: string | string[];
    name?: string | string[];
    amount?: string | string[];
    note?: string | string[];
  }>();
  const vpa = first(params.vpa) ?? '';
  const payeeName = first(params.name) ?? null;
  const amountFixed = first(params.amount) ?? null;

  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState(amountFixed ?? '');
  const [note, setNote] = useState(first(params.note) ?? '');
  const [method, setMethod] = useState<'WALLET' | 'UPI' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const config = useQuery({
    queryKey: ['outlet', outlet?.id, 'quickscan-config'],
    queryFn: () => fetchQuickScanConfig(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  const methods = config.data?.methods ?? [];

  // Default to the one method that can actually be used, once — never silently:
  // whatever is chosen still renders as chosen.
  useEffect(() => {
    if (method != null) return;
    const usable = methods.find((option) => option.available);
    if (usable != null) setMethod(usable.method);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, config.data]);

  const pay = useMutation({
    mutationFn: () => createQuickScanPayment(
      accessToken as string,
      outlet?.id as number,
      {
        payeeVpa: vpa,
        payeeName: payeeName ?? undefined,
        amount: amount.trim(),
        note: note.trim() === '' ? undefined : note.trim(),
        method: 'WALLET',
      },
      idempotency.key(),
    ),
    onSuccess: (payment) => {
      idempotency.settle();
      setConfirming(false);
      track('quickscan_paid', { screen: SCREEN, entityId: payment.id, outletId: outlet?.id });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outlet?.id, 'wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outlet?.id, 'quickscan-config'] });
      router.replace(`/restaurant/quickscan/${payment.id}`);
    },
    onError: (caught) => {
      idempotency.settle(caught);
      setConfirming(false);
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that. Try again.', 'error');
    },
  });

  const amountOk = isAmount(amount);
  const mayPay = canForOutlet('QUICKSCAN_PAY', outlet);
  const canSubmit = amountOk && method === 'WALLET' && mayPay && !pay.isPending;

  return (
    <MandiScreen header={<MandiHeader title="Pay" subtitle={payeeName ?? vpa} back />}>
      {config.isPending ? (
        <MandiSkeletonList count={3} />
      ) : config.error || config.data == null ? (
        <MandiErrorState message="Couldn't load QuickScan." onRetry={() => config.refetch()} />
      ) : !config.data.enabled ? (
        <MandiEmptyState
          icon="qr-code-outline"
          title="QuickScan isn't available yet"
          description="Check back soon, or pay this shop another way for now."
        />
      ) : (
        <>
          <MandiCard>
            <MandiText variant="caption" muted>Paying</MandiText>
            <MandiText variant="title">{payeeName ?? 'UPI ID'}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>{vpa}</MandiText>
          </MandiCard>

          <MandiCard>
            <MandiFormField
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              prefix="₹"
              keyboardType="decimal-pad"
              disabled={amountFixed != null}
              hint={amountFixed != null ? 'Set by the QR code' : `Up to ${formatMoney(config.data.maxAmount)}`}
            />
            <MandiFormField
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="What this is for"
              maxLength={200}
            />
            {Number(config.data.fee) > 0 && (
              <View style={styles.row}>
                <MandiText variant="body" color={Colors.textSecondary}>Fee</MandiText>
                <MandiText variant="bodyEmphasis">{formatMoney(config.data.fee)}</MandiText>
              </View>
            )}
          </MandiCard>

          <MandiCard>
            <MandiText variant="bodyEmphasis">How would you like to pay?</MandiText>
            <View style={styles.options}>
              {methods.map((option) => {
                const active = method === option.method;
                const trailing = option.method === 'WALLET' ? formatMoney(config.data.walletBalance) : null;
                return (
                  <Pressable
                    key={option.method}
                    disabled={!option.available}
                    onPress={() => setMethod(option.method)}
                    accessibilityRole="radio"
                    {...radioProps(active, !option.available)}
                    style={[
                      styles.option,
                      active && styles.optionActive,
                      !option.available && styles.optionDisabled,
                    ]}
                  >
                    <View style={styles.flex}>
                      <MandiText
                        variant="body"
                        color={option.available ? Colors.textPrimary : Colors.textTertiary}
                      >
                        {methodLabel(option)}
                      </MandiText>
                      {option.reason != null && (
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {option.reason}
                        </MandiText>
                      )}
                    </View>
                    {trailing != null && (
                      <MandiText
                        variant="captionEmphasis"
                        color={option.available ? Colors.textPrimary : Colors.textTertiary}
                      >
                        {trailing}
                      </MandiText>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </MandiCard>

          <MandiButton
            label="Pay"
            size="lg"
            disabled={!canSubmit}
            loading={pay.isPending}
            onPress={() => setConfirming(true)}
          />
        </>
      )}

      <MandiConfirm
        visible={confirming}
        title={`Pay ${formatMoney(amount.trim())} to ${payeeName ?? vpa} from your wallet?`}
        message={`Sent to ${vpa}. This leaves your wallet as soon as you confirm.`}
        confirmLabel="Pay"
        onConfirm={() => pay.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  options: { gap: Spacing.sm, marginTop: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionActive: { borderColor: Colors.primary, borderWidth: 2 },
  optionDisabled: { backgroundColor: Colors.surfaceSunken },
});
