import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWallet, withdrawFromWallet } from '@/services/wallet';
import { fetchQuickScanConfig } from '@/services/quickscan';
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
  MandiText,
  useToast,
} from '@/components/common';
import { usePermissions } from '@/hooks/usePermissions';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { isAmount } from '@/lib/disputes/refundCopy';
import { walletKey } from '@/lib/queryKeys';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { RoundAction } from '@/components/wallet/RoundAction';
import { WalletHero } from '@/components/wallet/WalletHero';
import { withdrawFailure, type WithdrawFailure } from '@/lib/wallet/withdrawError';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { ScanQrIcon } from '@/components/icons/ScanQrIcon';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-WALLET-01';

/** How many of the latest movements the wallet screen shows; the rest are on History. */
const RECENT_SHOWN = 3;

/** Diameter of the orange circle on the "Do more" tiles; the glyph inside scales to it. */
const TIP_CIRCLE = 40;

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
 *
 * <p>Laid out as a balance card, three round actions (Withdraw, Add money,
 * History), then the latest three movements. History is the one way into the
 * past; "See all" opens the same screen. Withdraw opens the same form and confirm as ever;
 * nothing about what may be sent, or by whom, moved.
 */
export default function WalletScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  /** The server's last answer to a withdrawal, shown in the form until the next attempt. */
  const [failure, setFailure] = useState<WithdrawFailure | null>(null);

  const wallet = useQuery({
    queryKey: walletKey(outlet?.id),
    queryFn: () => fetchWallet(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  // Only to know whether to offer "Pay any shop by scanning"; hidden if it fails.
  const quickScan = useQuery({
    queryKey: ['outlet', outlet?.id, 'quickscan-config'],
    queryFn: () => fetchQuickScanConfig(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  const withdraw = useMutation({
    mutationFn: () => withdrawFromWallet(accessToken as string, outlet?.id as number,
      amount.trim(), idempotency.key()),
    onMutate: () => setFailure(null),
    onSuccess: (result) => {
      idempotency.settle();
      setConfirming(false);
      setAmount('');
      setWithdrawing(false);
      track('wallet_withdrawn', { screen: SCREEN, entityId: outlet?.id });
      toast.show(`${formatMoney(result.amount)} is on its way back to your card or bank.`, 'success');
    },
    onError: (caught) => {
      // A 422 is a refusal: the key is dropped, so "instead" and any retry get a
      // new one. A 503 (paused or not) and a network failure keep it: nothing is
      // known to have failed, and the paused server released the key on its side.
      idempotency.settle(caught);
      setConfirming(false);
      const outcome = withdrawFailure(caught);
      setFailure(outcome);
      // A refusal is shown in the form, where its button is; the rest as a toast too.
      if (outcome.kind === 'OTHER') toast.show(outcome.message, 'error');
    },
    // Whatever happened, the balance and the statement are the server's to say.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: walletKey(outlet?.id) });
    },
  });

  /** Ask for exactly the amount the server said could go: a new request, so a new key. */
  const withdrawInstead = (offered: string) => {
    setAmount(offered);
    setFailure(null);
    setConfirming(true);
  };

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
          <WalletHero wallet={wallet.data} />

          <View style={styles.actions}>
            {mayWithdraw && (
              <RoundAction
                testID="action-withdraw"
                icon="arrow-undo-outline"
                label="Withdraw"
                onPress={() => setWithdrawing((open) => !open)}
              />
            )}
            <RoundAction
              testID="action-add-money"
              icon="add"
              label="Add money"
              primary
              onPress={() => router.push('/restaurant/wallet/add-money')}
            />
            <RoundAction
              testID="action-history"
              icon="time-outline"
              label="History"
              onPress={() => router.push('/restaurant/wallet/history')}
            />
          </View>

          {mayWithdraw && withdrawing && (
            <MandiCard>
              <View style={styles.form}>
              <MandiText variant="bodyEmphasis">Send back to your card or bank</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Only refunds can go back, to the payment they came from. Banks usually show it within
                5–7 working days.
              </MandiText>
              <MandiFormField
                label="Amount"
                value={amount}
                onChangeText={(text) => { setAmount(text); setFailure(null); }}
                placeholder="0.00"
                prefix="₹"
                keyboardType="decimal-pad"
              />
              {failure != null && failure.kind !== 'OTHER' && (
                <View accessibilityRole="alert" style={styles.notice}>
                  <MandiText variant="body">{failure.message}</MandiText>
                  {failure.kind === 'PAUSED' && (
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      Nothing was taken from your wallet. Try again in a little while.
                    </MandiText>
                  )}
                  {failure.kind === 'EXCEEDS_REFUNDABLE' && failure.withdrawableNow != null && (
                    <MandiButton
                      label={`Withdraw ${formatMoney(failure.withdrawableNow)} instead`}
                      variant="secondary"
                      size="md"
                      loading={withdraw.isPending}
                      onPress={() => withdrawInstead(failure.withdrawableNow as string)}
                    />
                  )}
                </View>
              )}
              <MandiButton
                label="Withdraw"
                size="md"
                disabled={!isAmount(amount)}
                loading={withdraw.isPending}
                onPress={() => setConfirming(true)}
              />
              </View>
            </MandiCard>
          )}

          <MandiSectionHeader
            title="Recent"
            actionLabel={wallet.data.recent.length > 0 ? 'See all' : undefined}
            onAction={() => router.push('/restaurant/wallet/history')}
          />
          {wallet.data.recent.length === 0 ? (
            <MandiEmptyState
              icon="wallet-outline"
              title="Nothing yet"
              description="Refunds and wallet payments will appear here."
            />
          ) : (
            <View style={styles.recent} testID="recent-list">
              {wallet.data.recent.slice(0, RECENT_SHOWN).map((entry, i, shown) => (
                <TransactionRow key={entry.id} entry={entry} last={i === shown.length - 1} />
              ))}
            </View>
          )}

          <MandiSectionHeader title="Do more with your wallet" />
          <View style={styles.tips}>
            {quickScan.data?.enabled === true && (
              <MandiCard
                style={{ flex: 1 }}
                onPress={() => router.push('/restaurant/quickscan')}
                accessibilityLabel="Pay any shop by scanning"
              >
                <View style={styles.tip}>
                  <ScanQrIcon size={TIP_CIRCLE} variant="filled" />
                  <MandiText variant="bodyEmphasis">Pay any shop by scanning</MandiText>
                </View>
              </MandiCard>
            )}
            <MandiCard
              style={{ flex: 1 }}
              onPress={() => router.push('/restaurant/(tabs)/discover')}
              accessibilityLabel="Use it on orders"
            >
              <View style={styles.tip}>
                <View style={styles.cartCircle}>
                  <Ionicons name="cart-outline" size={TIP_CIRCLE * 0.5} color={Colors.white} />
                </View>
                <MandiText variant="bodyEmphasis">Use it on orders</MandiText>
              </View>
            </MandiCard>
          </View>
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
  notice: { gap: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  form: { gap: Spacing.md },
  tips: { flexDirection: 'row', gap: Spacing.listGap },
  tip: { gap: Spacing.sm },
  // The rows carry their own padding and dividers, as on History: no card padding around them,
  // so the card hugs its content.
  recent: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  cartCircle: {
    width: TIP_CIRCLE,
    height: TIP_CIRCLE,
    borderRadius: TIP_CIRCLE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
