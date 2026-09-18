import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { useDebounced } from '@/hooks/useDebounced';
import { fetchIntent, previewResponse, respondToIntent } from '@/services/intent';
import { intentKey, storeIntentsKey } from '@/lib/queryKeys';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiCountdown,
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
import { supplierIntentStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { formatMoney, formatQuantity } from '@/utils/money';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { skuSecondaryLine, skuTitle } from '@/utils/skuLabel';
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

  /**
   * What this reply comes to, priced by the server.
   *
   * <p>Debounced because it fires on every stepper tap, and keyed on the
   * quantities so a tap that lands mid-flight supersedes the previous answer
   * rather than racing it. `placeholderData` keeps the last figure on screen
   * while the next arrives, so the total does not blink to nothing.
   */
  const offeredKey = useDebounced(JSON.stringify(offered), 300);
  const preview = useQuery({
    queryKey: [...intentKey(intentId), 'respond-preview', offeredKey],
    queryFn: () =>
      previewResponse(accessToken as string, intentId,
        (request?.items ?? []).map((item) => ({
          intentItemId: item.id,
          offeredQuantity: String(offered[item.id] ?? 0),
        }))),
    enabled: answerable && Object.keys(offered).length > 0 && accessToken != null,
    placeholderData: (previous) => previous,
  });

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
        // What this supplier was actually looking at. A restaurant may change
        // quantities while a request is open, so accepting without saying which
        // version you read is accepting whatever it happens to be now.
        expectedRevision: request?.revision,
        notes: notes.trim() === '' ? undefined : notes.trim(),
      }),
    onSuccess: () => {
      track('intent_answered', { screen: SCREEN, entityId: intentId });
      void queryClient.invalidateQueries({ queryKey: intentKey(intentId) });
      void queryClient.invalidateQueries({ queryKey: storeIntentsKey(storeId) });
      toast.show('Accepted', 'success');
    },
    onError: (caught) => {
      // The request moved while they were deciding. Reload it and say so,
      // rather than leaving a stale list on screen with an error over it.
      if (caught instanceof ApiError && caught.code === 'INTENT_CHANGED') {
        void query.refetch();
        setOffered({});
        toast.show(
          'The restaurant changed this request. Please review it and accept again.',
          'error',
        );
        return;
      }
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error');
    },
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
            {/* Status leads, as it does on the restaurant's screen: it is what
                the reader is here to find out, and having the two sides put it
                on opposite edges made the same request look like two things. */}
            <View style={styles.row}>
              <MandiStatusChip {...supplierIntentStatus(request.status, request.fulfilment)} />
              <View style={styles.countColumn}>
                <MandiText variant="bodyEmphasis">
                  {request.items.length} item{request.items.length === 1 ? '' : 's'} requested
                </MandiText>
                {request.requestedDeliveryTime != null && (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Wanted by {new Date(request.requestedDeliveryTime).toLocaleString()}
                  </MandiText>
                )}
              </View>
            </View>

            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatMomentWithRecency(request.sentAt ?? request.createdAt)}
            </MandiText>

            {request.notes != null && request.notes !== '' && (
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
                “{request.notes}”
              </MandiText>
            )}

            {answerable && request.responseDeadline != null && (
              <View style={styles.countdown}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Accept within
                </MandiText>
                {/* The store's own promise, counted down against the server's
                    clock. Without this a supplier had no idea they were on one. */}
                <MandiCountdown
                  deadlineAt={request.responseDeadline}
                  slaSeconds={request.responseWindowSeconds ?? undefined}
                  action="to accept"
                  onExpire={() => void query.refetch()}
                />
              </View>
            )}

            {answerable && (
              <View style={styles.hint}>
                <Ionicons name="pricetag-outline" size={15} color={Colors.textTertiary} />
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                  These are the prices this request was sent at, so you only say how
                  much you have. Set a line to zero if you can&apos;t supply it.
                </MandiText>
              </View>
            )}
          </MandiCard>

          <MandiCard>
            <MandiText variant="bodyEmphasis">
              {answerable ? 'What can you supply?' : 'What you accepted'}
            </MandiText>
            {request.items.map((item) => (
              <LineRow
                key={item.id}
                item={item}
                editable={answerable}
                value={offered[item.id] ?? 0}
                lineTotal={preview.data?.lines
                  .find((line) => line.intentItemId === item.id)?.lineTotal ?? null}
                onChange={(next) => setOffered((current) => ({ ...current, [item.id]: next }))}
              />
            ))}
          </MandiCard>

          {answerable ? (
            <MandiCard>
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
                label="You accepted"
                value={formatMoney(request.acceptance.offeredTotal)}
                emphasis
              />
              {request.status === 'RESPONSES_RECEIVED' && (
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
  You&apos;ve accepted this. Waiting for the restaurant to order — hold this stock until they do.
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
        {!everythingDeclined && preview.data != null && (
          <View style={styles.footerTotal}>
            <View style={styles.flex}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                You&apos;re accepting
              </MandiText>
              <MandiText variant="caption" color={Colors.textTertiary}>
                Items {formatMoney(preview.data.offeredValue)} · GST{' '}
                {formatMoney(preview.data.offeredGst)}
              </MandiText>
            </View>
            <MandiText variant="priceLarge">
              {formatMoney(preview.data.offeredTotal)}
            </MandiText>
          </View>
        )}
        <MandiButton
          label={
            everythingDeclined
              ? 'Decline request'
              // "With changes" when they are giving less than was asked for:
              // the restaurant is about to be told something they did not ask
              // for, and the button should say so before it is pressed.
              : totals.short > 0 || totals.declined > 0
                ? 'Accept with changes'
                : 'Accept request'
          }
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
  lineTotal,
  onChange,
}: {
  item: IntentItem;
  editable: boolean;
  value: number;
  /** The server's figure for the quantity currently set. */
  lineTotal: string | null;
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
      <ProductThumb uri={item.sku?.imageUrl} size={44} />
      <View style={styles.itemText}>
        <MandiText variant="body" numberOfLines={1}>
          {skuTitle(item.sku)}
        </MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>
          {skuSecondaryLine(item.sku, item.agreedUnitPriceInclusiveGst)}
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
              itemLabel={skuTitle(item.sku)}
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

      {/* Answered: what was committed to. Still answering: what the quantity
          on screen comes to, as the server priced it. */}
      {!declined && (editable ? lineTotal : item.lineTotal) != null && (
        <MandiText variant="bodyEmphasis">
          {formatMoney((editable ? lineTotal : item.lineTotal) as string)}
        </MandiText>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  countColumn: { alignItems: 'flex-end', gap: 2 },
  note: { marginTop: Spacing.md, fontStyle: 'italic' },
  countdown: { marginTop: Spacing.md, gap: Spacing.xs },
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
  footerTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
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
