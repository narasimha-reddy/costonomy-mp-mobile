import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchProcurement } from '@/services/procurement';
import { confirmPayment, simulateCheckout } from '@/services/payments';
import type { PaymentIntent, SubmitResponse } from '@/models/procurement';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiText,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { submitKey } from '@/lib/queryKeys';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-PAY-01';

type Phase = 'authorizing' | 'confirming' | 'success' | 'unknown' | 'failed';

/**
 * REST-PAY-01. Doc 05 §14.
 *
 * <p>The states are the spec's: authorisation pending, success, failed, and
 * verification pending — the last being the one that matters. <b>Nothing here
 * decides that a payment succeeded.</b> Doc 05 §14: "never infer final financial
 * success only from client callback". The client hands the server a provider
 * payment id and the server asks the provider. If the confirm call itself cannot
 * be reached, this screen says we are still checking — never "paid" and never
 * "failed", because an unconfirmed payment is genuinely unknown and a webhook or
 * the reconciliation job may already have settled it.
 *
 * <p>The payment intents come from the submit response, which checkout leaves in
 * the query cache. Reopening this screen cold — after a crash, or from a link —
 * finds nothing there, and the screen says to check Orders rather than guessing
 * at what is outstanding and paying something twice.
 *
 * <p>Against a mock provider there is no hosted checkout to open, so
 * authorisation goes through the server's mock-only simulation endpoint, which
 * refuses unless the provider really is a mock.
 */
export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const procurementId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const [phase, setPhase] = useState<Phase>('authorizing');
  const [message, setMessage] = useState<string | null>(null);
  const [paid, setPaid] = useState(0);
  const started = useRef(false);

  const submitted = queryClient.getQueryData<SubmitResponse>(submitKey(procurementId));

  const procurement = useQuery({
    queryKey: ['procurement', procurementId],
    queryFn: () => fetchProcurement(accessToken as string, procurementId),
    enabled: Number.isFinite(procurementId) && accessToken != null,
  });

  const pay = useCallback(async (intents: PaymentIntent[]) => {
    if (accessToken == null) return;
    setMessage(null);
    setPhase('authorizing');

    let done = 0;
    for (const intent of intents) {
      let providerPaymentId: string;
      try {
        ({ providerPaymentId } = await simulateCheckout(accessToken, intent.paymentId));
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
        const confirmed = await confirmPayment(accessToken, intent.paymentId, providerPaymentId);
        if (confirmed.status === 'FAILED') {
          setPhase('failed');
          setMessage(confirmed.failureMessage ?? 'The payment was declined by the bank.');
          return;
        }
      } catch {
        // Authorisation may well have happened; we simply do not know. Saying
        // either "paid" or "failed" here would be the client deciding a financial
        // outcome, which is the one thing §14 forbids.
        setPhase('unknown');
        return;
      }

      done += 1;
      setPaid(done);
    }

    track('payment_confirmed', { screen: SCREEN, outletId, entityId: procurementId },
      { suppliers: intents.length });
    setPhase('success');
  }, [accessToken, outletId, procurementId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (submitted == null) {
      // Nothing to pay from: this screen was opened cold.
      setPhase('unknown');
      return;
    }
    if (submitted.paymentIntents.length === 0) {
      // A credit order funds without a payment step.
      setPhase('success');
      return;
    }
    void pay(submitted.paymentIntents);
  }, [submitted, pay]);

  return (
    <MandiScreen header={<MandiHeader title="Payment" />}>
      {phase === 'success' && (
        <MandiCard>
          <View style={styles.center}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
            <MandiText variant="subtitle" center>Order placed</MandiText>
            <MandiText variant="body" color={Colors.textSecondary} center>
              Your suppliers have been notified and are responding now. Each answer appears
              in Orders.
            </MandiText>
          </View>
        </MandiCard>
      )}

      {phase === 'unknown' && (
        <MandiCard accentColor={Colors.warning}>
          <View style={styles.center}>
            <Ionicons name="hourglass-outline" size={48} color={Colors.warning} />
            <MandiText variant="subtitle" center>We&rsquo;re still checking</MandiText>
            <MandiText variant="body" color={Colors.textSecondary} center>
              We could not confirm the outcome from here. Your money is not at risk — the
              payment provider tells us directly, and Orders will show the result shortly.
              Do not pay again.
            </MandiText>
          </View>
        </MandiCard>
      )}

      {phase === 'failed' && (
        <MandiErrorState
          title="Payment didn't go through"
          message={message ?? 'The payment was not completed.'}
          onRetry={submitted ? () => void pay(submitted.paymentIntents) : undefined}
        />
      )}

      {(phase === 'authorizing' || phase === 'confirming') && (
        <MandiCard>
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <MandiText variant="subtitle" center>
              {phase === 'authorizing' ? 'Authorising your payment' : 'Confirming with the provider'}
            </MandiText>
            <MandiText variant="body" color={Colors.textSecondary} center>
              Please keep this screen open. An order only reaches its supplier once the
              payment is confirmed.
            </MandiText>
            {paid > 0 && (
              <MandiText variant="caption" color={Colors.textTertiary} center>
                {paid} of {submitted?.paymentIntents.length ?? 0} suppliers paid
              </MandiText>
            )}
          </View>
        </MandiCard>
      )}

      {procurement.data && (
        <MandiCard>
          <View style={styles.row}>
            <MandiText variant="body" color={Colors.textSecondary}>Order total</MandiText>
            <MandiText variant="price">{formatMoney(procurement.data.totalAmount)}</MandiText>
          </View>
        </MandiCard>
      )}

      {(phase === 'success' || phase === 'failed' || phase === 'unknown') && (
        <MandiButton
          label="Go to orders"
          size="lg"
          onPress={() => router.replace('/restaurant/(tabs)/orders')}
        />
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
