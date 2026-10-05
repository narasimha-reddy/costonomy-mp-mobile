import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { fetchCreditSummary } from '@/services/credit';
import { CreditDuesRow } from '@/components/credit/CreditDuesRow';
import { CreditLineRow } from '@/components/credit/CreditLineRow';
import { CreditOverviewHero } from '@/components/credit/CreditOverviewHero';
import { PayMultipleSheet } from '@/components/credit/PayMultipleSheet';
import { PayFromWalletSheet } from '@/components/credit/PayFromWalletSheet';
import { SupplierPickSheet } from '@/components/credit/SupplierPickSheet';
import {
  MandiButton,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { canReportPayment } from '@/lib/credit/claims';
import { agreementName, allSuspended, groupAgreements } from '@/lib/credit/overview';
import type { CreditAgreement } from '@/models/credit';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/**
 * REST-CREDIT-01. Doc 05 §19.
 *
 * <p>What the restaurant owes comes first, the limit second. Credit is
 * supplier-funded, so the question a restaurant opens this screen with is
 * "what do I owe, and to whom". Every figure and state is the server's.
 */
export default function CreditOverviewScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { offline } = useNetworkStatus();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickFor, setPickFor] = useState<'pay' | 'claim'>('pay');
  const [multiOpen, setMultiOpen] = useState(false);
  const [target, setTarget] = useState<CreditAgreement | null>(null);

  const query = useQuery({
    queryKey: ['outlet', outletId, 'credit'],
    queryFn: () => fetchCreditSummary(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const summary = query.data;
  const open = (id: number) => router.push(`/restaurant/credit/${id}`);
  const request = () => router.push('/restaurant/credit/request');

  const groups = summary ? groupAgreements(summary.agreements) : { dues: [], lines: [] };
  const showPay = summary?.walletRepayEnabled === true && Number(summary.due) > 0 && groups.dues.length > 0;

  const onPay = () => {
    setPickFor('pay');
    if (groups.dues.length === 1) setTarget(groups.dues[0] ?? null);
    else setMultiOpen(true);
  };

  const showClaim = summary != null && Number(summary.due) > 0 && groups.dues.length > 0
    && canReportPayment(summary.reportableAmount);
  const claimFor = (id: number) =>
    router.push({ pathname: '/restaurant/credit/claim', params: { agreementId: String(id) } });
  const onClaim = () => {
    const only = groups.dues[0];
    if (groups.dues.length === 1 && only != null) claimFor(only.id);
    else {
      setPickFor('claim');
      setPickerOpen(true);
    }
  };

  return (
    <MandiScreen
      header={<MandiHeader title="Credit" back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={undefined}
    >
      <MandiOfflineBanner visible={offline} />
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
          onAction={request}
        />
      ) : (
        <>
          {allSuspended(summary.agreements) && (
            <View style={styles.banner} accessibilityRole="alert" testID="credit-paused-banner">
              <Ionicons name="alert-circle" size={IconSize.md} color={Colors.danger} />
              <MandiText variant="bodyEmphasis" color={Colors.danger} style={styles.bannerText}>
                {`Ordering on credit is paused. Paying what's overdue can restore it.`}
              </MandiText>
            </View>
          )}

          <CreditOverviewHero
            summary={summary}
            showPay={showPay}
            payDisabled={offline}
            onPay={onPay}
            showClaim={showClaim}
            onClaim={onClaim}
          />

          {groups.dues.length > 0 && (
            <View style={styles.section}>
              <MandiSectionHeader title="Dues by supplier" />
              {groups.dues.map((a) => (
                <CreditDuesRow key={a.id} agreement={a} onPress={() => open(a.id)} />
              ))}
            </View>
          )}

          {groups.lines.length > 0 && (
            <View style={styles.section}>
              <MandiSectionHeader
                title="Credit lines"
                subtitle="Each line is separate. One supplier's credit does not fund another's order."
              />
              {groups.lines.map((a) => (
                <CreditLineRow key={a.id} agreement={a} onPress={() => open(a.id)} />
              ))}
            </View>
          )}

          <MandiButton
            label="Request credit from another supplier"
            variant="secondary"
            onPress={request}
          />

          <SupplierPickSheet
            visible={pickerOpen}
            onClose={() => setPickerOpen(false)}
            agreements={groups.dues}
            title={pickFor === 'claim' ? 'Which supplier did you pay?' : 'Pay which supplier?'}
            onPick={(a) => {
              setPickerOpen(false);
              if (pickFor === 'claim') claimFor(a.id);
              else setTarget(a);
            }}
          />
          {multiOpen && (
            <PayMultipleSheet
              visible
              onClose={() => setMultiOpen(false)}
              agreements={groups.dues}
              onPayOne={() => {
                setMultiOpen(false);
                setPickFor('pay');
                setPickerOpen(true);
              }}
            />
          )}
          {target != null && (
            <PayFromWalletSheet
              visible
              onClose={() => setTarget(null)}
              agreementId={target.id}
              supplierName={agreementName(target)}
              due={target.due}
              overdue={target.overdue}
              onPaid={() => setTarget(null)}
            />
          )}
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerLight,
  },
  bannerText: { flex: 1 },
});
