import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  confirmDeliveryFundingPayment,
  fetchDeliveryFundingHistory,
  fetchDeliveryFundingSummary,
  initiateDeliveryFundingPayment,
} from '@/services/deliveryFunding';
import { openRazorpayCheckout } from '@/lib/payments/razorpayCheckout';
import { createSingleFlight } from '@/lib/wallet/topUpFlow';
import { canPayNow, nextActionText, outcomeLabel, outcomeTone } from '@/lib/deliveryFunding/display';
import { fundingCheckoutRequest, runFundingPayment, type FundingPayOutcome } from '@/lib/deliveryFunding/payFlow';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import {
  FilterPills,
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import type { DeliveryFundingLine } from '@/models/deliveryFunding';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Owed' },
  { key: 'PAID_DIRECTLY', label: 'Paid by you' },
  { key: 'APPLIED', label: 'From payouts' },
  { key: 'WAIVED', label: 'Waived' },
];

/**
 * SUP-SETTLE-03. What this store owes Costonomy for the riders it chose to pay for (D-203), and what became of it.
 *
 * <p>Every figure is the server's; this screen adds nothing up. The four buckets do not overlap, and none of them is
 * a payment to a courier, which is why the words say "your share of the delivery" and never "courier".
 *
 * <p>Whether a line can be paid now is the server's `nextAction`. A payment that has been made is never reported as
 * failed: if confirming is slow the screen says it is being confirmed (`lib/deliveryFunding/payFlow.ts`).
 */
export default function DeliveryFundingScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const idempotency = useIdempotencyKey();
  const flight = useRef(createSingleFlight<FundingPayOutcome>());
  const keyedFor = useRef<number | null>(null);

  const [filter, setFilter] = useState('ALL');
  const [payingId, setPayingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);

  const enabled = storeId != null && accessToken != null;
  const summary = useQuery({
    queryKey: ['store', storeId, 'delivery-funding', 'summary'],
    queryFn: () => fetchDeliveryFundingSummary(accessToken as string, storeId as number),
    enabled,
  });
  const history = useQuery({
    queryKey: ['store', storeId, 'delivery-funding', 'history', filter],
    queryFn: () => fetchDeliveryFundingHistory(accessToken as string, storeId as number, {
      status: filter === 'ALL' ? undefined : filter, size: 50,
    }),
    enabled,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'delivery-funding'] });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'settlements'] });
  };

  function pay(line: DeliveryFundingLine) {
    if (accessToken == null || storeId == null || flight.current.busy) return;
    const token = accessToken;
    const store = storeId;
    void flight.current.run(async () => {
      // A key belongs to one charge; another charge is another attempt.
      if (keyedFor.current !== line.deductionId) idempotency.reset();
      keyedFor.current = line.deductionId;
      setPayingId(line.deductionId);
      setNotice(null);
      const outcome = await runFundingPayment({
        initiate: () => initiateDeliveryFundingPayment(token, store, line.deductionId, idempotency.key()),
        checkout: async (checkout) => {
          const result = await openRazorpayCheckout(fundingCheckoutRequest(
            checkout, Constants.expoConfig?.name ?? '', Colors.primary,
          ));
          return { paymentId: result.providerPaymentId, signature: result.providerSignature ?? '' };
        },
        confirm: (proof) => confirmDeliveryFundingPayment(token, store, line.deductionId, proof),
        isPaid: async () => {
          const paid = await fetchDeliveryFundingHistory(token, store, { status: 'PAID_DIRECTLY', size: 100 });
          return paid.some((l) => l.deductionId === line.deductionId);
        },
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onPhase: () => undefined,
      });
      if (outcome.initiateError !== undefined) idempotency.settle(outcome.initiateError); else idempotency.settle();
      setPayingId(null);
      if (outcome.phase === 'paid') toast.show('Payment received', 'success');
      else if (outcome.message) setNotice({ id: line.deductionId, message: outcome.message });
      refresh();
      return outcome;
    });
  }

  const lines = history.data ?? [];

  return (
    <MandiScreen
      header={<MandiHeader title="Delivery charges" back right={<StoreSelector />} />}
      onRefresh={() => { void summary.refetch(); void history.refetch(); }}
      refreshing={history.isRefetching}
    >
      <MandiText variant="caption" color={Colors.textSecondary}>
        Your share of deliveries you chose to pay for. This is owed to us; it is not a payment to a delivery partner.
      </MandiText>

      {summary.isPending ? (
        <MandiSkeletonList count={1} />
      ) : summary.error ? (
        <MandiErrorState message="Couldn't load your totals." onRetry={() => summary.refetch()} />
      ) : (
        <MandiCard>
          <Row label="Owed now" value={formatMoney(summary.data?.pending)}
            hint={summary.data && summary.data.pendingCount > 0
              ? `${summary.data.pendingCount} ${summary.data.pendingCount === 1 ? 'charge' : 'charges'}` : undefined}
            strong />
          <Row label="Paid by you" value={formatMoney(summary.data?.collectedDirectly)} />
          <Row label="Taken from payouts" value={formatMoney(summary.data?.appliedToSettlement)} />
          <Row label="Waived" value={formatMoney(summary.data?.waived)} />
          {Number(summary.data?.creditsPending ?? 0) > 0 || Number(summary.data?.creditsApplied ?? 0) > 0 ? (
            <>
              <Row label="Credit coming in your next payout" value={formatMoney(summary.data?.creditsPending)} />
              <Row label="Credited in payouts" value={formatMoney(summary.data?.creditsApplied)} />
            </>
          ) : null}
        </MandiCard>
      )}

      <FilterPills items={FILTERS} selected={filter} onSelect={setFilter} />

      {history.isPending ? (
        <MandiSkeletonList count={3} />
      ) : history.error ? (
        <MandiErrorState message="Couldn't load your delivery charges." onRetry={() => history.refetch()} />
      ) : lines.length === 0 ? (
        <MandiEmptyState
          icon="bicycle-outline"
          title="Nothing here"
          description="A charge appears when a delivery you chose to pay for has been picked up."
        />
      ) : (
        <>
          <MandiSectionHeader title={filter === 'ALL' ? 'Every charge' : (FILTERS.find((f) => f.key === filter)?.label ?? '')} />
          {lines.map((line) => {
            const action = nextActionText(line.nextAction);
            const isCredit = line.kind === 'DELIVERY_FUNDING_CREDIT';
            return (
              <MandiCard key={line.deductionId}>
                <View style={styles.row}>
                  <MandiText variant="bodyEmphasis">{line.orderNumber}</MandiText>
                  <MandiStatusChip label={outcomeLabel(line.outcome)} tone={outcomeTone(line.outcome)} size="sm" />
                </View>
                <MandiText variant="title">
                  {isCredit ? '− ' : ''}{formatMoney(line.amount)}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {isCredit ? 'Credit after a correction' : line.reason}
                </MandiText>
                {action ? <MandiText variant="caption">{action}</MandiText> : null}
                {notice?.id === line.deductionId ? (
                  <MandiText variant="caption" color={Colors.textSecondary}>{notice.message}</MandiText>
                ) : null}
                {canPayNow(line) ? (
                  <MandiButton
                    label="Pay now"
                    size="md"
                    icon="card-outline"
                    loading={payingId === line.deductionId}
                    disabled={payingId != null && payingId !== line.deductionId}
                    onPress={() => pay(line)}
                  />
                ) : null}
                {line.settlementId != null ? (
                  <MandiButton
                    label="See the payout"
                    variant="secondary"
                    size="md"
                    onPress={() => router.push(`/supplier/settlements/${line.settlementId}`)}
                  />
                ) : null}
              </MandiCard>
            );
          })}
        </>
      )}
    </MandiScreen>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <MandiText variant={strong ? 'bodyEmphasis' : 'body'}>{label}</MandiText>
        {hint ? <MandiText variant="caption" color={Colors.textSecondary}>{hint}</MandiText> : null}
      </View>
      <MandiText variant={strong ? 'bodyEmphasis' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  flex: { flex: 1 },
});
