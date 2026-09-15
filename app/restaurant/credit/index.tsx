import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCreditSummary } from '@/services/credit';
import { CreditPosition } from '@/components/credit/CreditPosition';
import {
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
} from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * REST-CREDIT-01. Doc 05 §19.
 *
 * <p>The whole position first, then each supplier's agreement separately — §19
 * requires supplier-specific agreements to be shown apart, because credit with
 * one supplier says nothing about what another will fund.
 */
export default function CreditOverviewScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'credit'],
    queryFn: () => fetchCreditSummary(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const summary = query.data;

  return (
    <MandiScreen
      header={<MandiHeader title="Credit" back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={undefined}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load your credit." onRetry={() => query.refetch()} />
      ) : summary == null || summary.agreements.length === 0 ? (
        <MandiEmptyState
          icon="card-outline"
          title="No credit yet"
          description="Ask a supplier you order from regularly for a credit line."
          actionLabel="Request credit"
          onAction={() => router.push('/restaurant/credit/request')}
        />
      ) : (
        <>
          <CreditPosition
            approvedLimit={summary.approvedLimit}
            reserved={summary.reserved}
            utilized={summary.utilized}
            available={summary.available}
            due={summary.due}
            overdue={summary.overdue}
          />

          <View style={styles.section}>
            <MandiSectionHeader
              title="By supplier"
              subtitle="Each line is separate — one supplier's credit does not fund another's order"
            />
            {summary.agreements.map((agreement) => (
              <MandiCard
                key={agreement.id}
                onPress={() => router.push(`/restaurant/credit/${agreement.id}`)}
                accentColor={agreement.status === 'SUSPENDED' ? Colors.danger : undefined}
              >
                <View style={styles.row}>
                  <MandiText variant="bodyEmphasis">
                    {agreement.supplierName ?? agreement.storeName}
                  </MandiText>
                  <MandiStatusChip
                    label={agreement.status.toLowerCase()}
                    tone={
                      agreement.status === 'ACTIVE' ? 'success'
                        : agreement.status === 'SUSPENDED' || agreement.status === 'REJECTED'
                          ? 'danger' : 'pending'
                    }
                    size="sm"
                  />
                </View>
                <View style={styles.row}>
                  {/* An agreement's own `available` is a real figure, but it is only
                      spendable when the server says it can fund. Showing
                      "₹35,000 available" under a headline reading "₹0 available"
                      — which is what a line awaiting acceptance looks like — tells
                      a restaurant they have money they cannot spend. */}
                  <MandiText
                    variant="caption"
                    color={agreement.canFund ? Colors.textSecondary : Colors.textTertiary}
                  >
                    {agreement.canFund
                      ? `${formatMoney(agreement.available, true)} available`
                      : `${formatMoney(agreement.approvedLimit, true)} approved`}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    {agreement.creditPeriodDays ?? '—'} day terms
                  </MandiText>
                </View>
                {/* canFund is the server's answer, never inferred from status. */}
                {!agreement.canFund && (
                  <MandiText variant="caption" color={Colors.warning}>
                    {unusableReason(agreement)}
                  </MandiText>
                )}
              </MandiCard>
            ))}
          </View>

          <MandiButton
            label="Request credit from another supplier"
            variant="secondary"
            onPress={() => router.push('/restaurant/credit/request')}
          />
        </>
      )}
    </MandiScreen>
  );
}

/**
 * Why a credit line cannot fund an order, in the restaurant's terms.
 *
 * <p>`canFund` is one boolean with several causes, and "unavailable" would leave
 * a restaurant guessing between a decision they have to make and one the supplier
 * has made for them.
 */
function unusableReason(agreement: { status: string; suspensionReason: string | null }): string {
  switch (agreement.status) {
    case 'APPROVED':
      return 'Approved — accept the terms to start using it.';
    case 'REQUESTED':
      return 'Waiting for the supplier to respond.';
    case 'SUSPENDED':
      return agreement.suspensionReason
        ? `Suspended. ${agreement.suspensionReason}`
        : 'Suspended by the supplier.';
    case 'EXPIRED':
      return 'This credit line has expired.';
    default:
      return 'Not usable for a new order right now.';
  }
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
