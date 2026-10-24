import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStoreClaims } from '@/services/credit';
import type { ClaimResponse } from '@/models/credit';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import { ClaimReviewSheet } from '@/components/credit/ClaimReviewSheet';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { useDecideClaim } from '@/hooks/useDecideClaim';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import {
  STALE_GROUP_TITLE, duplicateWarning, groupClaimsByRestaurant, mayDecideClaims, splitStale, waitingText,
} from '@/lib/credit/claimInbox';
import { claimMethodLabel } from '@/lib/credit/claims';
import { claimsKey } from '@/lib/queryKeys';
import { serverNow } from '@/lib/server-clock';
import { formatDay, relative } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing } from '@/theme';

/**
 * Claims inbox: payments a restaurant says it made straight to this supplier.
 *
 * <p>A claim changes nothing until the supplier confirms it. Every amount and
 * date shown is the server's. "Waiting 3 days" is the server's `ageDays`, and the
 * "Waiting 7+ days" group is the server's `stale` flag: the app counts nothing.
 * The invoice's outstanding and the same-amount-and-reference warning are the server's too.
 */
export default function ClaimsInboxScreen() {
  const toast = useToast();
  const { accessToken } = useSession();
  const { storeId, store } = useStore();
  const { offline } = useNetworkStatus();
  const { canForStore } = usePermissions();
  const canAct = mayDecideClaims(canForStore, store);
  const decide = useDecideClaim();
  const [openId, setOpenId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: claimsKey(storeId),
    queryFn: () => fetchStoreClaims(accessToken as string, storeId as number, 'SUBMITTED'),
    enabled: storeId != null && accessToken != null,
  });

  const claims = query.data ?? [];
  const { stale, rest } = splitStale(claims);
  const groups = groupClaimsByRestaurant(rest);
  // Looked up by id so a refetch that drops the claim closes the sheet.
  const open = claims.find((c) => c.id === openId) ?? null;

  function close() {
    setOpenId(null);
    decide.reset();
  }

  async function confirm(claim: ClaimResponse, amount: string | null) {
    const response = await decide.confirm(claim, amount);
    if (response != null) {
      close();
      toast.show(`Confirmed. ${formatMoney(response.confirmedAmount ?? response.amount)} recorded from ${claim.restaurantName ?? 'the restaurant'}.`, 'success');
    }
  }

  async function reject(claim: ClaimResponse, reason: string) {
    const response = await decide.reject(claim, reason);
    if (response != null) {
      close();
      toast.show('Done. The restaurant is told you did not receive it.', 'success');
    }
  }

  return (
    <MandiScreen
      header={<MandiHeader title="Payments to confirm" back right={<StoreSelector />} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      <MandiOfflineBanner visible={offline} />
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load these payments." onRetry={() => query.refetch()} />
      ) : claims.length === 0 ? (
        <MandiEmptyState
          icon="cash-outline"
          title="No payments waiting for you"
          description="When a restaurant says it paid you directly, it shows here for you to confirm."
        />
      ) : (
        <>
        {stale.length > 0 && (
          <View testID="claim-group-stale" style={styles.group}>
            <MandiSectionHeader title={STALE_GROUP_TITLE} count={stale.length} />
            {stale.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} onPress={() => { decide.reset(); setOpenId(claim.id); }} />
            ))}
          </View>
        )}
        {groups.map((group) => (
          <View key={group.name} testID={`claim-group-${group.name}`} style={styles.group}>
            <MandiSectionHeader title={group.name} />
            {group.claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} onPress={() => { decide.reset(); setOpenId(claim.id); }} />
            ))}
          </View>
        ))}
        </>
      )}

      <ClaimReviewSheet
        claim={open}
        visible={open != null}
        onClose={close}
        canAct={canAct}
        offline={offline}
        pending={decide.pending}
        error={decide.error}
        onConfirm={(c, a) => { void confirm(c, a); }}
        onReject={(c, r) => { void reject(c, r); }}
        onEdit={decide.reset}
      />
    </MandiScreen>
  );
}

function ClaimRow({ claim, onPress }: { claim: ClaimResponse; onPress: () => void }) {
  const sent = relative(new Date(claim.createdAt), new Date(serverNow()));
  const waiting = waitingText(claim);
  const duplicate = duplicateWarning(claim);
  const how = [claimMethodLabel(claim.method), claim.reference].filter((p) => p != null && p !== '').join(' · ');
  return (
    <MandiCard onPress={onPress} testID={`claim-row-${claim.id}`}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="cash-check" size={IconSize.md} color={Colors.primary} />
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis">{`${claim.invoiceNumber} · ${formatMoney(claim.amount)}`}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {`${how} · paid ${formatDay(claim.paidOn) ?? claim.paidOn}`}
          </MandiText>
          {claim.note != null && claim.note !== '' && (
            <MandiText variant="caption" color={Colors.textSecondary}>{claim.note}</MandiText>
          )}
          <MandiText variant="caption" color={Colors.warning} testID={`claim-waiting-${claim.id}`}>
            {waiting ?? `Sent ${sent}`}
          </MandiText>
          {claim.invoiceOutstanding != null && (
            <MandiText variant="caption" color={Colors.textSecondary} testID={`claim-outstanding-${claim.id}`}>
              {`Invoice still owes ${formatMoney(claim.invoiceOutstanding)}`}
            </MandiText>
          )}
          {duplicate != null && (
            <MandiText variant="caption" color={Colors.warning} testID={`claim-duplicate-${claim.id}`}>{duplicate}</MandiText>
          )}
        </View>
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  group: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
