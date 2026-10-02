import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWallet, withdrawFromWallet } from '@/services/wallet';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { usePermissions } from '@/hooks/usePermissions';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { isAmount } from '@/lib/disputes/refundCopy';
import { entryLabel, withdrawalProgress } from '@/lib/wallet/entryCopy';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-WALLET-01';

/**
 * REST-WALLET-01. The outlet's wallet: what is in it, why, and sending refund
 * money back to the card (API D-104).
 *
 * <p><b>Only refunds go back, and only to where they came from.</b> The server
 * decides how much can go and which cards it goes to; this screen sends an amount
 * and shows the answer. Money with no card behind it — a cancelled wallet order's
 * return, say — stays spendable, and the server says so if asked for it.
 *
 * <p>Withdrawing needs `WALLET_WITHDRAW` (owner, admin, purchase manager, finance).
 */
export default function WalletScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);

  const wallet = useQuery({
    queryKey: ['outlet', outlet?.id, 'wallet'],
    queryFn: () => fetchWallet(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  const withdraw = useMutation({
    mutationFn: () => withdrawFromWallet(accessToken as string, outlet?.id as number,
      amount.trim(), idempotency.key()),
    onSuccess: (result) => {
      idempotency.settle();
      setConfirming(false);
      setAmount('');
      track('wallet_withdrawn', { screen: SCREEN, entityId: outlet?.id });
      toast.show(`${formatMoney(result.amount)} is on its way back to your card or bank.`, 'success');
      void queryClient.invalidateQueries({ queryKey: ['outlet', outlet?.id, 'wallet'] });
    },
    onError: (caught) => {
      idempotency.settle(caught);
      setConfirming(false);
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that. Try again.', 'error');
    },
  });

  const mayWithdraw = canForOutlet('WALLET_WITHDRAW', outlet);

  return (
    <MandiScreen
      header={<MandiHeader title="Wallet" subtitle={outlet?.name} back />}
      onRefresh={() => wallet.refetch()}
      refreshing={wallet.isRefetching}
    >
      {wallet.isPending ? (
        <MandiSkeletonList count={3} />
      ) : wallet.error || wallet.data == null ? (
        <MandiErrorState message="Couldn't load your wallet." onRetry={() => wallet.refetch()} />
      ) : (
        <>
          <MandiCard>
            <MandiText variant="caption" color={Colors.textSecondary}>Balance</MandiText>
            <MandiText variant="title">{formatMoney(wallet.data.balance)}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              Refunds land here. Spend them on orders, or send them back to the card or bank you paid with.
            </MandiText>
          </MandiCard>

          {mayWithdraw && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Send back to your card or bank</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Only refunds can go back, to the payment they came from. Banks usually show it within
                5–7 working days.
              </MandiText>
              <MandiFormField
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                prefix="₹"
                keyboardType="decimal-pad"
              />
              <MandiButton
                label="Withdraw"
                size="md"
                disabled={!isAmount(amount)}
                loading={withdraw.isPending}
                onPress={() => setConfirming(true)}
              />
            </MandiCard>
          )}

          <MandiSectionHeader title="Recent" />
          {wallet.data.recent.length === 0 ? (
            <MandiEmptyState
              icon="wallet-outline"
              title="Nothing yet"
              description="Refunds and wallet payments will appear here."
            />
          ) : (
            wallet.data.recent.map((entry) => {
              const progress = withdrawalProgress(entry);
              return (
                <MandiCard key={entry.id}>
                  <View style={styles.row}>
                    <MandiText variant="bodyEmphasis">{entryLabel(entry)}</MandiText>
                    <MandiText
                      variant="price"
                      color={entry.direction === 'CREDIT' ? Colors.success : Colors.textPrimary}
                    >
                      {entry.direction === 'CREDIT' ? '+' : '−'}{formatMoney(entry.amount)}
                    </MandiText>
                  </View>
                  <View style={styles.row}>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {formatMomentWithRecency(entry.at)} · balance {formatMoney(entry.balanceAfter)}
                    </MandiText>
                    {progress != null && (
                      <MandiStatusChip label={progress.label} tone={progress.tone} size="sm" />
                    )}
                  </View>
                </MandiCard>
              );
            })
          )}
        </>
      )}

      <MandiConfirm
        visible={confirming}
        title={`Withdraw ${formatMoney(amount.trim())}?`}
        message="It leaves your wallet now and goes back to the card or bank you paid with."
        confirmLabel="Withdraw"
        onConfirm={() => withdraw.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
