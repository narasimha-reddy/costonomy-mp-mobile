import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { confirmPayment, fetchPaymentIntent, type OrderPaymentIntent } from '@/services/payments';
import { fetchSupplierOrder } from '@/services/procurement';
import { completeCheckout } from '@/lib/payments/checkout';
import { payOutcome } from '@/lib/payments/outcome';
import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import { orderPaymentKey } from '@/lib/queryKeys';
import {
  MandiButton,
  MandiCard,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import type { IntentPaymentIntent } from '@/models/intent';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-PAY-02';

type Phase = 'review' | 'authorizing' | 'confirming' | 'success' | 'unknown' | 'failed' | 'ended';

/**
 * Pay for one order, created from one request. D-088.
 *
 * <p>One order and one payment, always — a request goes to a single supplier, so
 * there is no multi-supplier checkout to orchestrate here.
 *
 * <p><b>Nothing is charged until somebody asks for it.</b> The screen opens on the
 * amount and the method, and the charge starts when the button is pressed.
 *
 * <p><b>This screen never decides a financial outcome.</b> Every ending is read
 * from the server (`payOutcome`): paid when funds are secured, "try again" only
 * while the payment is still payable, and over when it is not. That includes a
 * closed window and a native checkout error — Android UPI can report "cancelled"
 * after the money moved, and Razorpay accepts another attempt on an order whose
 * money is only held (capture is manual), so a screen that guessed "nothing has
 * been charged" could have led someone to pay twice.
 *
 * <p><b>The checkout comes from the server</b> (D-102). The request screen hands
 * the intent over in the cache, but this screen no longer depends on it: after a
 * refresh, a long bank flow or a visit from the order screen it asks
 * `GET /supplier-orders/{id}/payment-intent`, which never creates a provider
 * order.
 */
export default function PayForOrderScreen() {
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  const [phase, setPhase] = useState<Phase>('review');
  const [message, setMessage] = useState<string | null>(null);
  // A second tap before the button re-renders as busy would open checkout twice.
  const paying = useRef(false);

  const handedOver = queryClient.getQueryData<IntentPaymentIntent>(orderPaymentKey(orderId));

  const intent = useQuery({
    queryKey: ['supplier-order', orderId, 'payment-intent', 'server'],
    queryFn: () => fetchPaymentIntent(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  // Only for the figure: the server's own record of what is charged.
  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  /** Settle what the screen says from the server's payment, never from a guess. */
  const settle = useCallback((payment: OrderPaymentIntent, afterCheckout: boolean) => {
    const outcome = payOutcome(payment);
    if (outcome === 'paid') {
      track('payment_confirmed', { screen: SCREEN, entityId: orderId });
      setPhase('success');
      setMessage(null);
    } else if (outcome === 'ended') {
      setPhase('ended');
      setMessage(null);
    } else if (afterCheckout) {
      setPhase('failed');
      setMessage(payment.failureReason
        ? `${payment.failureReason} No money has been taken for this order; you can try again.`
        : null);
    } else {
      setPhase('review');
    }
  }, [orderId]);

  /** Ask the server where the payment stands. Unreachable is "unknown", never a verdict. */
  const askServer = useCallback(async (afterCheckout: boolean) => {
    if (accessToken == null) return;
    try {
      const fresh = await fetchPaymentIntent(accessToken, orderId);
      queryClient.setQueryData(['supplier-order', orderId, 'payment-intent', 'server'], fresh);
      settle(fresh, afterCheckout);
      return fresh;
    } catch {
      setPhase('unknown');
      return undefined;
    }
  }, [accessToken, orderId, queryClient, settle]);

  const pay = useCallback(async () => {
    const current = intent.data;
    if (accessToken == null || current == null || paying.current) return;
    paying.current = true;
    setMessage(null);
    setPhase('authorizing');

    try {
      let providerPaymentId: string;
      try {
        ({ providerPaymentId } = await completeCheckout(accessToken, {
          supplierOrderId: current.supplierOrderId,
          paymentId: current.paymentId,
          provider: current.provider,
          providerOrderId: current.providerOrderId,
          amount: current.amount,
          currency: current.currency,
          publicKey: current.publicKey,
        }, `Order ${order.data?.orderNumber ?? orderId}`));
      } catch (caught) {
        if (caught instanceof CheckoutUnavailable) {
          // Checkout never opened; nothing could have moved.
          setPhase('failed');
          setMessage(caught.message);
          return;
        }
        // Closed, or failed natively: the money may still have moved (Android UPI
        // reports "cancelled" after success). Ask before saying anything.
        const fresh = await askServer(true);
        if (fresh != null && payOutcome(fresh) === 'retry') {
          setPhase(caught instanceof CheckoutDismissed ? 'review' : 'failed');
          setMessage(caught instanceof CheckoutDismissed
            ? 'The payment window was closed. If you completed a payment, Orders will show it shortly; otherwise you can pay below.'
            : caught instanceof CheckoutFailed || caught instanceof ApiError
              ? `${caught.message} If money left your account, Orders will show the order shortly.`
              : 'The payment did not complete. If money left your account, Orders will show the order shortly.');
        }
        return;
      }

      setPhase('confirming');
      try {
        const confirmed = await confirmPayment(accessToken, current.paymentId, providerPaymentId);
        // The server's answer, field by field: funded, still payable, or over.
        const answered: OrderPaymentIntent = {
          ...current,
          status: confirmed.status,
          fundsSecured: confirmed.fundsSecured,
          payable: confirmed.status === 'CREATED',
          failureReason: confirmed.failureReason,
        };
        queryClient.setQueryData(['supplier-order', orderId, 'payment-intent', 'server'], answered);
        settle(answered, true);
      } catch {
        // Authorisation may well have happened; we simply do not know. The
        // provider tells the server directly, and Orders will show it.
        setPhase('unknown');
      }
    } finally {
      paying.current = false;
    }
  }, [accessToken, askServer, intent.data, order.data?.orderNumber, orderId, queryClient, settle]);

  // The server's answer on arrival: already paid (a webhook got there first), or
  // over, is said at once rather than after a tap.
  const current = intent.data;
  const serverPhase = current == null ? null : payOutcome(current);
  const shown: Phase = phase === 'review' && serverPhase === 'paid' ? 'success'
    : phase === 'review' && serverPhase === 'ended' ? 'ended'
      : phase;
  const payable = current != null && serverPhase === 'retry';

  const total = order.data?.totalAmount;
  const loading = (intent.isPending && handedOver == null) || (order.isPending && shown === 'review');

  return (
    <MandiScreen header={undefined}>
      {loading ? (
        <MandiSkeletonList count={2} />
      ) : intent.isError && current == null ? (
        <MandiCard>
          <View style={styles.centre}>
            <Ionicons name="help-circle" size={48} color={Colors.textTertiary} />
            <MandiText variant="bodyEmphasis">{title('unknown')}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.centred}>
              We couldn&rsquo;t load this order&rsquo;s payment. Nothing has been charged from this screen.
            </MandiText>
          </View>
          <View style={styles.actions}>
            <MandiButton label="Try Again" size="lg" onPress={() => void intent.refetch()} />
            <MandiButton label="Go To Orders" variant="tertiary" size="lg"
              onPress={() => router.replace('/restaurant/(tabs)/orders')} />
          </View>
        </MandiCard>
      ) : (
        <MandiCard>
          <View style={styles.centre}>
            <Ionicons
              name={
                shown === 'success' ? 'checkmark-circle'
                  : shown === 'failed' || shown === 'ended' ? 'close-circle'
                    : shown === 'unknown' ? 'help-circle'
                      : shown === 'review' ? 'card-outline' : 'time'
              }
              size={48}
              accessibilityLabel={title(shown)}
              color={
                shown === 'success' ? Colors.success
                  : shown === 'failed' || shown === 'ended' ? Colors.danger
                    : shown === 'review' ? Colors.primary : Colors.textTertiary
              }
            />
            <MandiText variant="bodyEmphasis">{title(shown)}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.centred}>
              {message ?? body(shown)}
            </MandiText>

            {total != null && (
              <View style={styles.totalRow}>
                <MandiText variant="caption" color={Colors.textSecondary}>Order total</MandiText>
                <MandiText variant="priceLarge">{formatMoney(total)}</MandiText>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            {shown === 'review' && payable && (
              <MandiButton
                label={total != null ? `Pay ${formatMoney(total)}` : 'Pay Now'}
                size="lg"
                onPress={() => void pay()}
              />
            )}
            {/* Only while the server still takes a payment for this order. */}
            {shown === 'failed' && payable && (
              <MandiButton label="Try Again" size="lg" onPress={() => void pay()} />
            )}
            {/* Never while the charge is in flight: leaving mid-authorisation
                is how somebody ends up paying for an order they think they
                abandoned. */}
            {shown !== 'authorizing' && shown !== 'confirming' && (
              <MandiButton
                label={shown === 'success' ? 'View Order' : 'Go To Orders'}
                variant={shown === 'review' || (shown === 'failed' && payable) ? 'tertiary' : 'primary'}
                size="lg"
                onPress={() =>
                  router.replace(
                    shown === 'success'
                      ? `/restaurant/orders/${orderId}`
                      : '/restaurant/(tabs)/orders',
                  )}
              />
            )}
          </View>
        </MandiCard>
      )}
    </MandiScreen>
  );
}

function title(phase: Phase): string {
  switch (phase) {
    case 'review': return 'Pay for this order';
    case 'authorizing': return 'Authorising your payment';
    case 'confirming': return 'Confirming with your bank';
    case 'success': return 'Payment authorised';
    case 'failed': return 'Payment didn’t go through';
    case 'ended': return 'This payment can’t be completed';
    // Never "something went wrong": the money may well have moved, and telling
    // someone it failed is how they pay twice.
    case 'unknown': return 'We’re still checking';
  }
}

function body(phase: Phase): string {
  switch (phase) {
    case 'review':
      return 'Your supplier sees this order once the payment clears. Nothing is charged until you tap below.';
    case 'authorizing': return 'Hold on — this usually takes a moment.';
    case 'confirming': return 'Almost there.';
    case 'success':
      return 'Your supplier has the order and will start preparing it.';
    case 'failed':
      // Said because the server said so: the payment is not funded, and money is
      // only ever taken from a funded one. A bank hold, if any, is released.
      return 'No money has been taken for this order. If your bank shows a hold, it is released automatically. You can try again.';
    case 'ended':
      return 'This order’s payment has closed without being paid, and no money was taken for it. Check Orders, or order again from the request.';
    case 'unknown':
      return 'We could not confirm the outcome from here. Your money is not at risk — the payment provider tells us directly, and Orders will show the result shortly. Do not pay again.';
  }
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  centred: { textAlign: 'center' },
  totalRow: { alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md },
  actions: { gap: Spacing.sm },
});
