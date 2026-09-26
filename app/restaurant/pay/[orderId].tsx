import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { confirmPayment } from '@/services/payments';
import { completeCheckout } from '@/lib/payments/checkout';
import { CheckoutDismissed, CheckoutFailed, CheckoutUnavailable } from '@/lib/payments/types';
import { fetchSupplierOrder } from '@/services/procurement';
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

type Phase = 'review' | 'authorizing' | 'confirming' | 'success' | 'unknown' | 'failed';

/**
 * Pay for one order, created from one request. D-088.
 *
 * <p>One order and one payment, always — a request goes to a single supplier, so
 * there is no multi-supplier checkout to orchestrate here. That is the whole
 * reason this is a different screen from the cart's: the old one walks a list of
 * payment intents from a submission that fanned out across suppliers.
 *
 * <p><b>Nothing is charged until somebody asks for it.</b> This screen used to
 * run the whole checkout from a mount effect: the order was created, this
 * opened, and it went straight to "Payment authorised" without ever showing a
 * figure or waiting for a tap. That is not a payment step — it is a receipt for
 * a charge nobody agreed to, and it made the one screen standing between a
 * request and the restaurant's money a formality it could not decline.
 *
 * <p>So it opens on the amount and the method, and the charge starts when the
 * button is pressed. Everything after that is unchanged.
 *
 * <p><b>The provider's checkout is chosen by the intent</b> — Razorpay's window on
 * a real provider, the server's simulation on the mock (`lib/payments/checkout`).
 * Closing Razorpay's window returns here to the review state rather than to a
 * failure: nothing is known to have failed, and Razorpay refuses a second payment
 * against an order already paid, so paying again from here cannot charge twice.
 *
 * <p><b>This screen never decides a financial outcome.</b> If the confirm call
 * fails we do not know whether authorisation happened, so it says exactly that
 * and sends the person to Orders, which reads the authoritative state. Saying
 * either "paid" or "failed" on a guess is the one thing doc 01 §14 forbids.
 */
export default function PayForOrderScreen() {
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  const [phase, setPhase] = useState<Phase>('review');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  /**
   * The payment intent, handed over by the screen that created the order.
   *
   * <p>Cached rather than re-fetched because it is not a resource: the provider
   * order id is minted once, when the order is created, and asking for it again
   * would mean asking the server to arrange funding twice.
   */
  const intent = queryClient.getQueryData<IntentPaymentIntent>(orderPaymentKey(orderId));

  // Only for the figure and the fallback: if this screen is opened cold, the
  // order itself is what can still be shown.
  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const pay = useCallback(async (payment: IntentPaymentIntent) => {
    if (accessToken == null) return;
    setMessage(null);
    setPhase('authorizing');

    let providerPaymentId: string;
    try {
      ({ providerPaymentId } = await completeCheckout(
        accessToken, payment, `Order ${order.data?.orderNumber ?? orderId}`));
    } catch (caught) {
      if (caught instanceof CheckoutDismissed) {
        setPhase('review');
        setMessage(
          'The payment window was closed. If you completed a payment, Orders will show it '
          + 'shortly; otherwise you can pay below.',
        );
        return;
      }
      setPhase('failed');
      setMessage(
        caught instanceof ApiError
          || caught instanceof CheckoutUnavailable
          || caught instanceof CheckoutFailed
          ? caught.message
          : 'We could not start the payment. Nothing has been charged.',
      );
      return;
    }

    setPhase('confirming');
    try {
      const confirmed = await confirmPayment(accessToken, payment.paymentId, providerPaymentId);
      if (confirmed.status === 'FAILED') {
        setPhase('failed');
        setMessage(confirmed.failureReason ?? 'The payment was declined by the bank.');
        return;
      }
    } catch {
      // Authorisation may well have happened; we simply do not know.
      setPhase('unknown');
      return;
    }

    track('payment_confirmed', { screen: SCREEN, entityId: orderId });
    setPhase('success');
  }, [accessToken, orderId, order.data?.orderNumber]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (intent == null) {
      // Opened cold — there is nothing here to pay from. Still the only thing
      // this effect does: paying is the button's job, not the screen's.
      setPhase('unknown');
    }
  }, [intent]);

  const total = order.data?.totalAmount;

  return (
    <MandiScreen header={undefined}>
      {order.isPending && phase === 'review' ? (
        <MandiSkeletonList count={2} />
      ) : (
        <MandiCard>
          <View style={styles.centre}>
            <Ionicons
              name={
                phase === 'success' ? 'checkmark-circle'
                  : phase === 'failed' ? 'close-circle'
                    : phase === 'unknown' ? 'help-circle'
                      : phase === 'review' ? 'card-outline' : 'time'
              }
              size={48}
              color={
                phase === 'success' ? Colors.success
                  : phase === 'failed' ? Colors.danger
                    : phase === 'review' ? Colors.primary : Colors.textTertiary
              }
            />
            <MandiText variant="bodyEmphasis">{title(phase)}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.centred}>
              {message ?? body(phase)}
            </MandiText>

            {total != null && (
              <View style={styles.totalRow}>
                <MandiText variant="caption" color={Colors.textSecondary}>Order total</MandiText>
                <MandiText variant="priceLarge">{formatMoney(total)}</MandiText>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            {phase === 'review' && intent != null && (
              <MandiButton
                label={total != null ? `Pay ${formatMoney(total)}` : 'Pay Now'}
                size="lg"
                onPress={() => void pay(intent)}
              />
            )}
            {phase === 'failed' && intent != null && (
              <MandiButton label="Try Again" size="lg" onPress={() => void pay(intent)} />
            )}
            {/* Never while the charge is in flight: leaving mid-authorisation
                is how somebody ends up paying for an order they think they
                abandoned. */}
            {phase !== 'authorizing' && phase !== 'confirming' && (
              <MandiButton
                label={phase === 'success' ? 'View Order' : 'Go To Orders'}
                variant={phase === 'review' || phase === 'failed' ? 'tertiary' : 'primary'}
                size="lg"
                onPress={() =>
                  router.replace(
                    phase === 'success'
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
    case 'failed': return 'Payment failed';
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
      return 'Nothing has been charged. You can try again.';
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
