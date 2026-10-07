import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchRefundsDue } from '@/services/credit';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import { RefundRow } from '@/components/credit/RefundRow';
import {
  MandiBottomSheet,
  MandiButton,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { useMarkRefunded } from '@/hooks/useMarkRefunded';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { mayDecideClaims } from '@/lib/credit/claimInbox';
import { refundsDueKey } from '@/lib/queryKeys';
import type { RefundDue, RefundDueStatus } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

const CHIPS: { key: RefundDueStatus; label: string }[] = [
  { key: 'OPEN', label: 'To give back' },
  { key: 'REFUNDED', label: 'Refunded' },
];
const NOTE_MAX = 500;

/**
 * Refunds to give back: money a restaurant had already paid on an invoice whose order was
 * cancelled. The supplier gives it back directly (UPI, bank, cash) and marks it here; nothing
 * moves in the app. A refund the restaurant paid from its Mandi wallet is ours to settle, so it
 * has no action. Every figure, name and day is the server's.
 */
export default function RefundsScreen() {
  const toast = useToast();
  const { accessToken } = useSession();
  const { storeId, store } = useStore();
  const { offline } = useNetworkStatus();
  const { canForStore } = usePermissions();
  const canMark = mayDecideClaims(canForStore, store);
  const [status, setStatus] = useState<RefundDueStatus>('OPEN');
  const [marking, setMarking] = useState<RefundDue | null>(null);
  const [note, setNote] = useState('');
  const { mark, pending, error, reset } = useMarkRefunded();
  const tapped = useRef(false);

  const query = useQuery({
    queryKey: refundsDueKey(storeId, status),
    queryFn: () => fetchRefundsDue(accessToken as string, storeId as number, status),
    enabled: storeId != null && accessToken != null,
  });
  const rows = query.data ?? [];

  useEffect(() => { reset(); setNote(''); }, [marking, reset]);

  async function confirm() {
    if (marking == null || pending || offline || tapped.current) return;
    tapped.current = true;
    try {
      const text = note.trim();
      const done = await mark(marking.id, text === '' ? undefined : text);
      if (done != null) {
        setMarking(null);
        toast.show(`${formatMoney(marking.amount)} marked as refunded.`, 'success');
      }
    } finally {
      tapped.current = false;
    }
  }

  return (
    <MandiScreen
      header={<MandiHeader title="Refunds to give back" subtitle="Orders cancelled after the restaurant paid" back right={<StoreSelector />} />}
      onRefresh={() => { void query.refetch(); }}
      refreshing={query.isRefetching}
    >
      <MandiOfflineBanner visible={offline} />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {CHIPS.map((chip) => {
          const on = status === chip.key;
          return (
            <Pressable
              key={chip.key}
              testID={`refunds-status-${chip.key}`}
              onPress={() => setStatus(chip.key)}
              accessibilityRole="radio"
              accessibilityLabel={chip.label}
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <MandiText variant="captionEmphasis" color={on ? Colors.textInverse : Colors.textPrimary}>{chip.label}</MandiText>
            </Pressable>
          );
        })}
      </View>

      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.isError ? (
        <MandiErrorState message="Couldn't load the refunds." onRetry={() => { void query.refetch(); }} testID="refunds-error" />
      ) : rows.length === 0 ? (
        <MandiEmptyState
          icon="checkmark-done-outline"
          title={status === 'OPEN' ? 'Nothing to give back right now.' : 'No refunds marked yet.'}
          description={status === 'OPEN'
            ? 'When an order is cancelled after a restaurant paid, the refund shows here.' : undefined}
        />
      ) : (
        rows.map((refund) => (
          <RefundRow key={refund.id} refund={refund} canMark={canMark} offline={offline} onMark={setMarking} />
        ))
      )}

      <MandiBottomSheet
        visible={marking != null}
        onClose={() => setMarking(null)}
        title="Mark as refunded"
        closeLabel="Close"
        avoidKeyboard
        testID="refund-sheet"
      >
        {marking != null && (
          <View style={styles.body}>
            <MandiText variant="body">
              {`Have you given ${formatMoney(marking.amount)} back to ${marking.restaurantName ?? marking.outletName ?? 'the restaurant'}? Nothing moves in the app: this only records that you did.`}
            </MandiText>
            <MandiFormField
              label="Note (optional)"
              value={note}
              onChangeText={(t) => { setNote(t); reset(); }}
              placeholder="For example: sent by UPI"
              multiline
              maxLength={NOTE_MAX}
              disabled={pending}
              testID="refund-note"
            />
            {error != null && (
              <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" testID="refund-error">{error}</MandiText>
            )}
            {offline && <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>}
            <MandiButton
              testID="refund-confirm"
              label="Yes, I refunded it"
              loading={pending}
              disabled={pending || offline}
              onPress={() => { void confirm(); }}
            />
          </View>
        )}
      </MandiBottomSheet>
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceSunken,
  },
  chipOn: { backgroundColor: Colors.primary },
});
