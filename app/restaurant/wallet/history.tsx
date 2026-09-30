import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWallet } from '@/services/wallet';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
} from '@/components/common';
import { EntryRow } from '@/components/wallet/EntryRow';
import { groupEntriesByDay } from '@/lib/wallet/display';
import { walletKey } from '@/lib/queryKeys';
import { Spacing } from '@/theme';

/**
 * REST-WALLET-02. The wallet's past movements, grouped by day.
 *
 * <p>Reads the same wallet response as the wallet screen, so it shows exactly the
 * entries the server sent there — a longer, paged statement is the server's to add,
 * and this screen will show it without changing.
 */
export default function WalletHistoryScreen() {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();

  const wallet = useQuery({
    queryKey: walletKey(outlet?.id),
    queryFn: () => fetchWallet(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  const days = groupEntriesByDay(wallet.data?.recent ?? []);

  return (
    <MandiScreen
      header={<MandiHeader title="Past payments" subtitle={outlet?.name} back />}
      onRefresh={() => wallet.refetch()}
      refreshing={wallet.isRefetching}
    >
      {wallet.isPending ? (
        <MandiSkeletonList count={4} />
      ) : wallet.error || wallet.data == null ? (
        <MandiErrorState message="Couldn't load your wallet." onRetry={() => wallet.refetch()} />
      ) : days.length === 0 ? (
        <MandiEmptyState
          icon="wallet-outline"
          title="Nothing yet"
          description="Money added, refunds and wallet payments will appear here."
        />
      ) : (
        days.map(({ day, entries }) => (
          <View key={day} style={styles.day}>
            <MandiSectionHeader title={dayTitle(day)} />
            {entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
          </View>
        ))
      )}
    </MandiScreen>
  );
}

/** "29 Sep 2026", from the grouping key; entries with no readable time sit under "Earlier". */
function dayTitle(day: string): string {
  if (day === '') return 'Earlier';
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const styles = StyleSheet.create({
  day: { gap: Spacing.listGap },
});
