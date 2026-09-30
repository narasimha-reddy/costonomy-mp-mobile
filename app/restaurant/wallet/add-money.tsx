import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { confirmTopUp, createTopUp, fetchTopUpStatus, fetchWallet } from '@/services/wallet';
import { openRazorpayCheckout } from '@/lib/payments/razorpayCheckout';
import { walletKey } from '@/lib/queryKeys';
import { addChip, checkTopUp, TOP_UP_CHIPS } from '@/lib/wallet/amount';
import {
  checkoutRequest,
  createSingleFlight,
  IDLE,
  runTopUp,
  withTimeout,
  type TopUpDeps,
  type TopUpOutcome,
  type TopUpState,
} from '@/lib/wallet/topUpFlow';
import {
  MandiButton,
  MandiCard,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeleton,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-WALLET-03';

/** How long the confirm call gets before the payment is treated as "still confirming". */
const CONFIRM_TIMEOUT_MS = 20_000;

/**
 * REST-WALLET-03. Put money in the wallet through the provider's checkout.
 *
 * <p><b>The server decides everything that matters.</b> The limits shown and the
 * pre-checks on the amount are hints to save a round trip; the server checks the
 * amount again when the top-up is opened and its message is what is shown if it
 * refuses. The amount sent is the text typed, never a figure worked out here.
 *
 * <p><b>Once a payment has been made this screen never says it failed.</b> If
 * confirming errors or is slow, it says the payment is being confirmed and that the
 * balance will update — the server credits it on its own (`lib/wallet/topUpFlow.ts`
 * has the whole sequence). Closing checkout is quiet: no error, nothing confirmed.
 *
 * <p>One tap runs one attempt: a second tap while it is in flight starts nothing,
 * and a retry of an attempt whose outcome was unknown reuses its idempotency key so
 * it reaches the same top-up rather than opening another.
 */
export default function AddMoneyScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const idempotency = useIdempotencyKey();

  const [text, setText] = useState('');
  const [state, setState] = useState<TopUpState>(IDLE);
  const flight = useRef(createSingleFlight<TopUpOutcome>());
  // The amount the held idempotency key belongs to: a key must never be sent with
  // a different amount.
  const keyedAmount = useRef<string | null>(null);

  const wallet = useQuery({
    queryKey: walletKey(outlet?.id),
    queryFn: () => fetchWallet(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  const limits = wallet.data?.limits;
  const check = checkTopUp(text, limits, wallet.data?.balance);
  const busy = state.phase === 'creating' || state.phase === 'checkout' || state.phase === 'confirming';

  const refreshWallet = () => queryClient.invalidateQueries({ queryKey: walletKey(outlet?.id) });

  function leave() {
    if (router.canGoBack()) router.back(); else router.replace('/restaurant/wallet');
  }

  function pay() {
    const amount = check.amount;
    if (!check.ok || amount == null || accessToken == null || outlet == null || busy) return;
    const outletId = outlet.id;
    const token = accessToken;

    void flight.current.run(async () => {
      // A key belongs to one amount; a different amount is a different attempt.
      if (keyedAmount.current !== amount) idempotency.settle();
      keyedAmount.current = amount;
      const key = idempotency.key();

      track('wallet_top_up_started', { screen: SCREEN, outletId });
      const deps: TopUpDeps = {
        create: (value, k) => createTopUp(token, outletId, value, k),
        checkout: async (top) => {
          const result = await openRazorpayCheckout(checkoutRequest(
            top, Constants.expoConfig?.name ?? '', Colors.primary,
          ));
          return { paymentId: result.providerPaymentId, signature: result.providerSignature };
        },
        confirm: (top, proof) => withTimeout(
          confirmTopUp(token, outletId, top.topUpId, proof), CONFIRM_TIMEOUT_MS,
        ),
        status: (topUpId) => fetchTopUpStatus(token, outletId, topUpId),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onPhase: setState,
      };

      const outcome = await runTopUp(deps, amount, key);

      // Only an unknown result of opening the top-up keeps the key; every other
      // ending is one it is finished with.
      idempotency.settle(outcome.createError);
      if (outcome.createError === undefined) keyedAmount.current = null;

      void refreshWallet();
      if (outcome.phase === 'success') {
        track('wallet_top_up_credited', { screen: SCREEN, outletId });
        toast.show(`${formatMoney(amount)} added to your wallet.`, 'success');
        leave();
      }
      return outcome;
    });
  }

  const remaining = limits != null ? formatMoney(limits.remainingThisMonth, true) : null;

  return (
    <MandiScreen
      header={<MandiHeader title="Add money" subtitle={outlet?.name} back />}
      footer={state.phase === 'pending' ? undefined : (
        <MandiStickyBar>
          <MandiButton
            testID="pay"
            label={busy ? busyLabel(state) : check.ok && check.amount != null
              ? `Add ${formatMoney(check.amount)}` : 'Add money'}
            loading={busy}
            disabled={!check.ok}
            onPress={pay}
          />
        </MandiStickyBar>
      )}
    >
      {state.phase === 'pending' ? (
        <MandiCard>
          <View style={styles.centre}>
            <Ionicons name="time" size={48} color={Colors.textTertiary} accessibilityLabel="Confirming" />
            <MandiText variant="bodyEmphasis">We&rsquo;re confirming your payment</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} center>
              {state.message}
            </MandiText>
          </View>
          <MandiButton label="Back to wallet" onPress={() => router.replace('/restaurant/wallet')} />
        </MandiCard>
      ) : (
        <>
          <MandiCard>
            <View style={styles.form}>
              <MandiFormField
                label="Amount"
                value={text}
                onChangeText={(next) => {
                  setText(next.replace(/[^\d.]/g, ''));
                  if (state.phase === 'error' || state.phase === 'cancelled') setState(IDLE);
                }}
                placeholder="0"
                prefix="₹"
                keyboardType="decimal-pad"
                maxLength={12}
                disabled={busy}
                testID="amount"
                // Ours first, so the field names the limit; the server's refusal after that.
                error={check.message ?? (state.phase === 'error' ? state.message : null)}
              />

              <View style={styles.chips} accessibilityLabel="Quick amounts">
                {TOP_UP_CHIPS.map((rupees) => (
                  <Pressable
                    key={rupees}
                    testID={`chip-${rupees}`}
                    disabled={busy}
                    onPress={() => setText((current) => addChip(current, rupees))}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${formatMoney(rupees, true)}`}
                    style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                  >
                    <MandiText variant="captionEmphasis" color={Colors.primary}>
                      +{formatMoney(rupees, true)}
                    </MandiText>
                  </Pressable>
                ))}
            </View>

            {wallet.isPending ? (
              <MandiSkeleton width={180} height={14} />
            ) : limits != null ? (
              <View style={styles.limits}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Remaining this month {remaining}
                </MandiText>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  Each top-up: {formatMoney(limits.minTopUp, true)} to {formatMoney(limits.maxTopUp, true)}
                </MandiText>
              </View>
            ) : null}
            </View>
          </MandiCard>

          {state.phase === 'cancelled' && state.message != null && (
            <View style={styles.note} accessibilityLiveRegion="polite">
              <Ionicons name="information-circle-outline" size={IconSize.md} color={Colors.textSecondary} />
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                {state.message}
              </MandiText>
            </View>
          )}
        </>
      )}
    </MandiScreen>
  );
}

/** What the button says while the attempt is running. */
function busyLabel(state: TopUpState): string {
  switch (state.phase) {
    case 'checkout': return 'Complete the payment…';
    case 'confirming': return 'Confirming…';
    default: return 'Starting…';
  }
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  form: { gap: Spacing.md },
  chips: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: {
    minHeight: 48,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.85 },
  limits: { gap: 2 },
  note: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
