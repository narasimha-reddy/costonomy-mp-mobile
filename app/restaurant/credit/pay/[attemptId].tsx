import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOutlet } from '@/contexts/OutletProvider';
import { useCreditPayAttempt, useRefreshCredit } from '@/hooks/useCreditPay';
import { PayReceipt } from '@/components/credit/pay/PayReceipt';
import {
  MandiButton, MandiCard, MandiErrorState, MandiHeader, MandiScreen, MandiSkeletonList, MandiText,
} from '@/components/common';
import {
  ENDED_TEXT, PAID_TITLE, paidBody, PENDING_BODY, PENDING_LATER, PENDING_TITLE, refundBannerText, refundedBody,
  REFUNDED_TITLE,
} from '@/lib/credit/pay/copy';
import type { CreditPayAttempt } from '@/models/creditPay';
import { Colors, Spacing } from '@/theme';

/** The result screen stops polling after this; the server still settles the payment. */
export const POLL_STOP_MS = 2 * 60 * 1000;
const POLL_EVERY_MS = 5000;

/**
 * REST-CREDIT-PAY-03. How a credit payment ended: paid, partly or wholly returned, still being
 * confirmed, or not completed. Reads the attempt from the server and shows its figures as sent.
 */
export default function CreditPayResultScreen() {
  const router = useRouter();
  const { outlet } = useOutlet();
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const started = useRef(Date.now());
  const refresh = useRefreshCredit();
  const query = useCreditPayAttempt(attemptId, (a) => {
    const waiting = a != null && (a.status === 'CREATED' || a.refundState === 'PENDING');
    return waiting && Date.now() - started.current < POLL_STOP_MS ? POLL_EVERY_MS : false;
  });
  const attempt = query.data;

  // When the payment lands, the credit screens behind this one are stale.
  const settledFor = useRef<string | null>(null);
  useEffect(() => {
    if (attempt == null || attempt.status === 'CREATED') return;
    if (settledFor.current === attempt.status) return;
    settledFor.current = attempt.status;
    refresh();
  }, [attempt, refresh]);

  const done = () => router.replace('/restaurant/credit');
  // Re-render once when polling stops, so the "we'll update this" line can appear.
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStopped(true), POLL_STOP_MS);
    return () => clearTimeout(timer);
  }, []);
  const gaveUp = attempt?.status === 'CREATED' && stopped;

  return (
    <MandiScreen header={<MandiHeader title="Payment" subtitle={outlet?.name} back />}>
      {query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error || attempt == null ? (
        <MandiErrorState message="Couldn't load this payment." onRetry={() => query.refetch()} />
      ) : (
        <Result attempt={attempt} gaveUp={gaveUp} onDone={done} />
      )}
    </MandiScreen>
  );
}

function Result({ attempt, gaveUp, onDone }: { attempt: CreditPayAttempt; gaveUp: boolean; onDone: () => void }) {
  const hasRefund = Number(attempt.refundAmount) > 0;
  if (attempt.status === 'PAID') {
    return (
      <View style={styles.stack} testID="pay-result-paid">
        <Headline icon="checkmark-circle" color={Colors.success} title={PAID_TITLE} body={paidBody(attempt.amount, attempt.invoiceCount)} />
        {hasRefund && <Banner attempt={attempt} text={refundBannerText(attempt)} />}
        <PayReceipt attempt={attempt} />
        <DoneButton label="Done" onPress={onDone} />
      </View>
    );
  }
  if (attempt.status === 'REFUNDED') {
    return (
      <View style={styles.stack} testID="pay-result-refunded">
        <Headline icon="return-down-back" color={Colors.textSecondary} title={REFUNDED_TITLE} body={refundedBody(attempt)} />
        <DoneButton label="Done" onPress={onDone} />
      </View>
    );
  }
  if (attempt.status === 'CREATED') {
    return (
      <View style={styles.stack} testID="pay-result-pending">
        <Headline icon="time" color={Colors.textTertiary} title={PENDING_TITLE} body={PENDING_BODY} />
        {gaveUp && <MandiText variant="caption" color={Colors.textSecondary} center>{PENDING_LATER}</MandiText>}
        <DoneButton label="Done" onPress={onDone} />
      </View>
    );
  }
  return (
    <View style={styles.stack} testID="pay-result-ended">
      <Headline icon="close-circle" color={Colors.textTertiary} title={ENDED_TEXT} body={null} />
      <DoneButton label="Back to credit" onPress={onDone} />
    </View>
  );
}

function Headline({
  icon, color, title, body,
}: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body: string | null }) {
  return (
    <MandiCard>
      <View style={styles.centre}>
        <Ionicons name={icon} size={48} color={color} />
        <MandiText variant="bodyEmphasis" center>{title}</MandiText>
        {body != null && <MandiText variant="body" color={Colors.textSecondary} center>{body}</MandiText>}
      </View>
    </MandiCard>
  );
}

function Banner({ attempt, text }: { attempt: CreditPayAttempt; text: string }) {
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite" testID="pay-refund-banner">
      <Ionicons name="information-circle" size={20} color={Colors.warning} />
      <View style={styles.bannerText}>
        <MandiText variant="body">{text}</MandiText>
        {attempt.refundState === 'NEEDS_ATTENTION' && (
          <MandiText variant="caption" color={Colors.textSecondary}>
            This refund needs a closer look. We are on it; contact support if it has not arrived in a few days.
          </MandiText>
        )}
      </View>
    </View>
  );
}

function DoneButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <MandiButton testID="pay-result-done" label={label} onPress={onPress} />;
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  centre: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: 12,
    backgroundColor: Colors.warningLight,
  },
  bannerText: { flex: 1, gap: Spacing.xs },
});
