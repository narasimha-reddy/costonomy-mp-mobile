import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchIntent, respondToIntent } from '@/services/intent';
import { intentKey, storeIntentsKey } from '@/lib/queryKeys';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import type { IntentItem } from '@/models/intent';
import { SupplierIntentStatus, resolveStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { formatMoney, formatQuantity } from '@/utils/money';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'SUP-REQ-02';

/**
 * SUP-REQ-02 — say what this store will actually supply. D-088.
 *
 * <p><b>Quantities only.</b> There is no price field on this screen and there
 * must not be: every line is priced from this store's live catalogue offer, so a
 * price changes by editing the listing (D-012) and not by answering one request
 * differently. Otherwise the price a restaurant compared on the product screen
 * and the price it is charged could differ, with nothing to reconcile them.
 *
 * <p><b>Every line starts at what was asked for.</b> The common answer is "yes,
 * all of it", and making that the default means a supplier types only where they
 * are short. Dragging a line to zero declines it — explicitly, which is the point:
 * an unanswered line is rejected by the server rather than read as a refusal
 * nobody made.
 */
export default function SupplierRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const intentId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [offered, setOffered] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [eta, setEta] = useState('');
  const [confirmDecline, setConfirmDecline] = useState(false);

  const query = useQuery({
    queryKey: intentKey(intentId),
    queryFn: () => fetchIntent(accessToken as string, intentId),
    enabled: Number.isFinite(intentId) && accessToken != null,
  });

  const request = query.data;
  const answerable = request?.status === 'OPEN';

  /**
   * Seed the form from the request, once it arrives.
   *
   * <p>Keyed on the request's own id so switching between two requests reseeds,
   * and guarded on `answerable` so an already-answered request never has an
   * editable form built for it.
   */
  useEffect(() => {
    if (request == null || !answerable) return;
    setOffered(Object.fromEntries(
      request.items.map((item) => [item.id, Number(item.requestedQuantity)]),
    ));
  }, [request?.id, answerable]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    if (request == null) return { lines: 0, short: 0, declined: 0 };
    let short = 0;
    let declined = 0;
    request.items.forEach((item) => {
      const value = offered[item.id] ?? 0;
      if (value === 0) declined += 1;
      else if (value < Number(item.requestedQuantity)) short += 1;
    });
    return { lines: request.items.length, short, declined };
  }, [request, offered]);

  const everythingDeclined = request != null && totals.declined === totals.lines;

  const reply = useMutation({
    mutationFn: () =>
      respondToIntent(accessToken as string, intentId, {
        lines: (request?.items ?? []).map((item) => ({
          intentItemId: item.id,
          offeredQuantity: String(offered[item.id] ?? 0),
        })),
        etaMinutes: eta.trim() === '' ? undefined : Number(eta),
        notes: notes.trim() === '' ? undefined : notes.trim(),
      }),
    onSuccess: () => {
      track('intent_answered', { screen: SCREEN, entityId: intentId });
      void queryClient.invalidateQueries({ queryKey: intentKey(intentId) });
      void queryClient.invalidateQueries({ queryKey: storeIntentsKey(storeId) });
      toast.show('Reply sent', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that reply.', 'error'),
  });

  return (
    <MandiScreen
      header={<MandiHeader title={request?.reference ?? 'Request'} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={renderFooter()}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || request == null ? (
        <MandiErrorState message="Couldn't load this request." onRetry={() => query.refetch()} />
      ) : (
        <>
          <MandiCard>
            <View style={styles.row}>
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis">
                  {request.items.length} item{request.items.length === 1 ? '' : 's'} requested
                </MandiText>
                {request.requestedDeliveryTime != null && (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Wanted by {new Date(request.requestedDeliveryTime).toLocaleString()}
                  </MandiText>
                )}
              </View>
              <MandiStatusChip {...resolveStatus(SupplierIntentStatus, request.status)} />
            </View>

            {request.notes != null && request.notes !== '' && (
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
                “{request.notes}”
              </MandiText>
            )}

            {answerable && (
              <View style={styles.hint}>
                <Ionicons name="pricetag-outline" size={15} color={Colors.textTertiary} />
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                  Prices come from your catalogue — you only say how much you have.
                  Set a line to zero if you can&apos;t supply it.
                </MandiText>
              </View>
            )}
          </MandiCard>

          <MandiCard>
            <MandiText variant="bodyEmphasis">
              {answerable ? 'What can you supply?' : 'What you offered'}
            </MandiText>
            {request.items.map((item) => (
              <LineRow
                key={item.id}
                item={item}
                editable={answerable}
                value={offered[item.id] ?? 0}
                onChange={(next) => setOffered((current) => ({ ...current, [item.id]: next }))}
              />
            ))}
          </MandiCard>

          {answerable ? (
            <MandiCard>
              <MandiFormField
                label="Delivery estimate (minutes, optional)"
                value={eta}
                onChangeText={setEta}
                keyboardType="number-pad"
                placeholder="e.g. 90"
              />
              <MandiFormField
                label="Note for the restaurant (optional)"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Anything they should know about this order"
              />
            </MandiCard>
          ) : request.acceptance != null && (
            <MandiCard>
              <Row label="Item value" value={formatMoney(request.acceptance.offeredValue)} />
              <Row label="GST" value={formatMoney(request.acceptance.offeredGst)} />
              <Row
                label="You offered"
                value={formatMoney(request.acceptance.offeredTotal)}
                emphasis
              />
              {request.status === 'RESPONSES_RECEIVED' && (
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
                  Waiting for the restaurant to order. Hold this stock until they do.
                </MandiText>
              )}
              {request.status === 'ORDER_CREATION_EXPIRED' && (
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
                  They didn&apos;t order in time. This stock is yours again.
                </MandiText>
              )}
            </MandiCard>
          )}
        </>
      )}

      <MandiConfirm
        visible={confirmDecline}
        title="Decline the whole request?"
        message="You're telling them you have none of these items. They'll look elsewhere."
        confirmLabel="Decline all"
        destructive
        onConfirm={() => { setConfirmDecline(false); reply.mutate(); }}
        onCancel={() => setConfirmDecline(false)}
      />
    </MandiScreen>
  );

  function renderFooter() {
    if (request == null || !answerable) return undefined;

    return (
      <MandiStickyBar>
        {(totals.short > 0 || totals.declined > 0) && (
          <View style={styles.summary}>
            <Ionicons name="alert-circle-outline" size={15} color={Colors.warning} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              {totals.declined > 0 && `${totals.declined} line${totals.declined === 1 ? '' : 's'} declined`}
              {totals.declined > 0 && totals.short > 0 && ' · '}
              {totals.short > 0 && `${totals.short} short`}
            </MandiText>
          </View>
        )}
        <MandiButton
          label={everythingDeclined ? 'Decline request' : 'Send reply'}
          size="lg"
          variant={everythingDeclined ? 'destructive' : 'primary'}
          loading={reply.isPending}
          onPress={() => (everythingDeclined ? setConfirmDecline(true) : reply.mutate())}
        />
      </MandiStickyBar>
    );
  }
}

/**
 * One line: what they asked for, and what this store will give.
 *
 * <p>The requested quantity stays on screen next to the stepper rather than
 * being replaced by it. A supplier reducing a line needs to see what they are
 * reducing from, and the restaurant's own screen shows the same two figures.
 */
function LineRow({
  item,
  editable,
  value,
  onChange,
}: {
  item: IntentItem;
  editable: boolean;
  value: number;
  onChange: (next: number) => void;
}) {
  const requested = Number(item.requestedQuantity);
  const declined = editable ? value === 0 : Number(item.offeredQuantity ?? 0) === 0;
  const short = editable
    ? value > 0 && value < requested
    : item.offeredQuantity != null && Number(item.offeredQuantity) > 0
      && Number(item.offeredQuantity) < requested;

  return (
    <View style={styles.item}>
      <ProductThumb uri={item.imageUrl} size={44} />
      <View style={styles.itemText}>
        <MandiText variant="body" numberOfLines={1}>
          {item.productName ?? item.skuName ?? 'Item'}
        </MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {skuSecondaryLine(item.productName, item.skuName, item.packLabel)}
        </MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          They asked for {formatQuantity(item.requestedQuantity)} {item.unit}
        </MandiText>

        {editable ? (
          <>
            <MandiQuantityStepper
              value={value}
              onChange={onChange}
              min={0}
              max={requested}
              unit={item.unit}
              itemLabel={item.productName ?? 'item'}
            />
            {declined && (
              <MandiText variant="caption" color={Colors.danger}>
                You&apos;ll be telling them this isn&apos;t available
              </MandiText>
            )}
            {short && (
              <MandiText variant="caption" color={Colors.warning}>
                Short by {formatQuantity(String(requested - value))} {item.unit}
              </MandiText>
            )}
          </>
        ) : (
          <MandiText
            variant="caption"
            color={declined ? Colors.danger : short ? Colors.warning : Colors.success}
          >
            {declined
              ? 'You declined this line'
              : `You offered ${formatQuantity(item.offeredQuantity ?? '0')} ${item.unit}`}
          </MandiText>
        )}
      </View>

      {!editable && !declined && item.lineTotal != null && (
        <MandiText variant="bodyEmphasis">{formatMoney(item.lineTotal)}</MandiText>
      )}
    </View>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
        {label}
      </MandiText>
      <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  note: { marginTop: Spacing.md, fontStyle: 'italic' },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemText: { flex: 1, gap: Spacing.xs },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
});
