import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { confirmPayment, simulateCheckout } from '@/services/payments';
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

type Phase = 'authorizing' | 'confirming' | 'success' | 'unknown' | 'failed';

/**
 * Pay for one order, created from one request. D-088.
 *
 * <p>One order and one payment, always — a request goes to a single supplier, so
 * there is no multi-supplier checkout to orchestrate here. That is the whole
 * reason this is a different screen from the cart's: the old one walks a list of
 * payment intents from a submission that fanned out across suppliers.
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

  const [phase, setPhase] = useState<Phase>('authorizing');
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
      ({ providerPaymentId } = await simulateCheckout(accessToken, payment.paymentId));
    } catch (caught) {
      setPhase('failed');
      setMessage(
        caught instanceof ApiError
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
        setMessage(confirmed.failureMessage ?? 'The payment was declined by the bank.');
        return;
      }
    } catch {
      // Authorisation may well have happened; we simply do not know.
      setPhase('unknown');
      return;
    }

    track('payment_confirmed', { screen: SCREEN, entityId: orderId });
    setPhase('success');
  }, [accessToken, orderId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (intent == null) {
      // Opened cold — there is nothing here to pay from.
      setPhase('unknown');
      return;
    }
    void pay(intent);
  }, [intent, pay]);

  const total = order.data?.totalAmount;

  return (
    <MandiScreen header={undefined}>
      {order.isPending && phase === 'authorizing' ? (
        <MandiSkeletonList count={2} />
      ) : (
        <MandiCard>
          <View style={styles.centre}>
            <Ionicons
              name={
                phase === 'success' ? 'checkmark-circle'
                  : phase === 'failed' ? 'close-circle'
                    : phase === 'unknown' ? 'help-circle' : 'time'
              }
              size={48}
              color={
                phase === 'success' ? Colors.success
                  : phase === 'failed' ? Colors.danger : Colors.textTertiary
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
            {phase === 'failed' && intent != null && (
              <MandiButton label="Try again" size="lg" onPress={() => void pay(intent)} />
            )}
            <MandiButton
              label={phase === 'success' ? 'View order' : 'Go to orders'}
              variant={phase === 'failed' ? 'tertiary' : 'primary'}
              size="lg"
              onPress={() =>
                router.replace(
                  phase === 'success'
                    ? `/restaurant/orders/${orderId}`
                    : '/restaurant/(tabs)/orders',
                )}
            />
          </View>
        </MandiCard>
      )}
    </MandiScreen>
  );
}

function title(phase: Phase): string {
  switch (phase) {
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
