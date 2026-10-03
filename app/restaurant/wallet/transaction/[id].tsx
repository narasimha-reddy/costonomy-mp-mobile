import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiEmptyState, MandiErrorState, useToast } from '@/components/common';
import { DetailHeader } from '@/components/wallet/detail/DetailHeader';
import { DetailSkeleton } from '@/components/wallet/detail/DetailSkeleton';
import { TransactionDetailView } from '@/components/wallet/detail/TransactionDetailView';
import { useWalletTransaction } from '@/hooks/useWalletTransaction';
import { DetailColors, WalletColors } from '@/theme';

/**
 * Transaction details: one wallet movement in full, reached by tapping a History row.
 *
 * <p>The header takes the status's colour (green, amber, red, or the orange-brown of money
 * returned) and so does the system status bar. Under it the card says who the money went to
 * or came from, and "Transfer Details" lists our transaction id and the references. Share
 * Receipt turns a plain version of the card into a picture and opens the share sheet.
 */
export default function TransactionDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const query = useWalletTransaction(id);

  const back = useCallback(() => {
    if (router.canGoBack?.() === false) router.replace('/restaurant/wallet/history');
    else router.back();
  }, [router]);

  const copy = useCallback(async (value: string, what: string) => {
    try {
      await Clipboard.setStringAsync(value);
      toast.show('Copied', 'success');
    } catch {
      toast.show(`Could not copy the ${what.toLowerCase()}`, 'error');
    }
  }, [toast]);

  const entry = query.data;

  if (entry != null) {
    return (
      <TransactionDetailView
        entry={entry}
        onBack={back}
        onCopy={copy}
        onPayAgain={() => router.push({
          pathname: '/restaurant/quickscan/pay',
          params: {
            vpa: entry.actions.payeeVpa ?? '',
            ...(entry.counterpartyName ? { name: entry.counterpartyName } : {}),
          },
        })}
        onWallet={() => router.push('/restaurant/wallet')}
        onHistory={() => router.push('/restaurant/wallet/history')}
        onSupport={() => toast.show('Support is coming soon', 'info')}
        onError={(message) => toast.show(message, 'error')}
      />
    );
  }

  const notFound = (query.error as { status?: number } | null)?.status === 404;
  return (
    <View style={[styles.page, { paddingBottom: insets.bottom }]}>
      <DetailHeader color={WalletColors.orange} title="Transaction details" onBack={back} />
      {query.isError ? (
        notFound ? (
          <MandiEmptyState
            icon="receipt-outline"
            title="Transaction not found"
            description="This transaction is not in your wallet history."
            actionLabel="View History"
            onAction={() => router.push('/restaurant/wallet/history')}
          />
        ) : (
          <MandiErrorState
            message="We couldn't load this transaction. Check your connection and try again."
            onRetry={() => { void query.refetch(); }}
            retrying={query.isFetching}
          />
        )
      ) : (
        <DetailSkeleton />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: DetailColors.page },
});
