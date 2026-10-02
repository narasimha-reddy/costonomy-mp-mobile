import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchQuickScanPayment } from '@/services/quickscan';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { quickScanStatusCopy } from '@/lib/quickscan/statusCopy';
import { Colors, Spacing } from '@/theme';

const POLL_MS = 3000;

/**
 * REST-QUICKSCAN-03. What became of one QuickScan payment.
 *
 * <p><b>Polls only while `PAYOUT_PENDING`.</b> `refetchInterval` reads the
 * status out of the query's own cache each tick, so it stops itself the moment
 * the server reports a terminal one — no separate timer to remember to clear,
 * and nothing here keeps asking once the answer stops changing. TanStack Query
 * stops the interval on unmount on its own.
 *
 * <p>No back button: this is an outcome, not a page to return to. Both actions
 * leave it — scan another shop, or check the wallet the money actually moved
 * through.
 */
export default function QuickScanResultScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const paymentId = Number(raw);
  const router = useRouter();
  const { accessToken } = useSession();

  const payment = useQuery({
    queryKey: ['quickscan-payment', paymentId],
    queryFn: () => fetchQuickScanPayment(accessToken as string, paymentId),
    enabled: Number.isFinite(paymentId) && accessToken != null,
    refetchInterval: (query) => (query.state.data?.status === 'PAYOUT_PENDING' ? POLL_MS : false),
  });

  const copy = payment.data != null ? quickScanStatusCopy(payment.data) : null;

  return (
    <MandiScreen header={undefined}>
      {payment.isPending ? (
        <MandiSkeletonList count={2} />
      ) : payment.error || payment.data == null ? (
        <MandiErrorState message="Couldn't load this payment." onRetry={() => payment.refetch()} />
      ) : (
        <MandiCard>
          <View style={styles.centre}>
            {copy?.polling ? (
              <ActivityIndicator size="large" color={Colors.primary} />
            ) : (
              <Ionicons
                name={
                  payment.data.status === 'PAID' ? 'checkmark-circle'
                    : payment.data.status === 'FAILED' ? 'close-circle'
                      : 'information-circle'
                }
                size={48}
                accessibilityLabel={copy?.title}
                color={
                  payment.data.status === 'PAID' ? Colors.success
                    : payment.data.status === 'FAILED' ? Colors.danger
                      : Colors.warning
                }
              />
            )}
            <MandiText variant="bodyEmphasis" center>{copy?.title}</MandiText>
            {copy?.detail != null && (
              <MandiText variant="caption" color={Colors.textSecondary} center>
                {copy.detail}
              </MandiText>
            )}
            <MandiText variant="caption" color={Colors.textSecondary} center>
              {payment.data.payeeVpa}
            </MandiText>
          </View>

          <View style={styles.actions}>
            <MandiButton
              label="Scan Another"
              size="lg"
              onPress={() => router.replace('/restaurant/quickscan')}
            />
            <MandiButton
              label="Open Wallet"
              variant="tertiary"
              size="lg"
              onPress={() => router.replace('/restaurant/wallet')}
            />
          </View>
        </MandiCard>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  actions: { gap: Spacing.sm },
});
