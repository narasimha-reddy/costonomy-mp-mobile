import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import {
  acceptOrder,
  markPreparing,
  markReady,
  partialAcceptOrder,
  previewPartialAccept,
  type PartialAcceptPreview,
  rejectOrder,
  type PartialAcceptItem,
  type RejectionReason,
} from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiCountdown,
  MandiErrorState,
  MandiFormField,
  MandiConfirm,
  MandiHeader,
  MandiHeaderAction,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { formatDistance, orderValue } from '@/utils/orders';
import { formatMoment } from '@/utils/dateRange';
import { PaymentMethodPill } from '@/components/order';
import { ProductThumb } from '@/components/product/ProductThumb';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-ORD-01';

const REASONS: { key: RejectionReason; label: string }[] = [
  { key: 'OUT_OF_STOCK', label: 'Out of stock' },
  { key: 'UNABLE_TO_DELIVER', label: 'Unable to deliver' },
  { key: 'STORE_CLOSED', label: 'Store closed' },
  { key: 'PRICE_ISSUE', label: 'Price is wrong' },
  { key: 'BELOW_MINIMUM_ORDER', label: 'Below our minimum' },
  { key: 'OTHER', label: 'Something else' },
];

type Mode = 'view' | 'partial' | 'reject';

/**
 * SUP-ORD-01 through SUP-ORD-05. Doc 05 §25–§28.
 *
 * <p>One screen, because they are one decision followed by its consequences: the
 * supplier looks at an order and either takes it, takes part of it, or declines
 * it — and then moves it along. Splitting that across five screens would put a
 * navigation step inside a sixty-second window.
 *
 * <p><b>The deadline is the server's.</b> §25: "deadline is authoritative from
 * backend".
 *
 * <p><b>Accept and partial-accept carry idempotency keys.</b> One tap on a flaky
 * connection must not become two answers to the same order.
 */
export default function SupplierOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [mode, setMode] = useState<Mode>('view');
  const [accepted, setAccepted] = useState<Record<number, number>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());

  const query = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const order = query.data;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'orders', 'pending'] });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'orders', 'active'] });
  }

  function onRefusal(caught: unknown, fallback: string) {
    // The server's message says which of the several real reasons this is —
    // expired, already answered, no longer yours. Replacing it with "failed"
    // would leave the supplier tapping at an order that is already gone.
    toast.show(caught instanceof ApiError ? caught.message : fallback, 'error');
    void query.refetch();
  }

  const accept = useMutation({
    mutationFn: () => acceptOrder(accessToken as string, orderId, idempotencyKey),
    onSuccess: () => {
      track('order_accepted', { screen: SCREEN, entityId: orderId });
      invalidate();
      toast.show('Order accepted', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not accept this order.'),
  });

  const partial = useMutation({
    mutationFn: (items: PartialAcceptItem[]) =>
      partialAcceptOrder(accessToken as string, orderId, items, note || undefined, idempotencyKey),
    onSuccess: () => {
      track('order_partially_accepted', { screen: SCREEN, entityId: orderId });
      invalidate();
      setMode('view');
      toast.show('Partial acceptance sent', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not send that.'),
  });

  const reject = useMutation({
    mutationFn: () =>
      rejectOrder(accessToken as string, orderId, reason as RejectionReason,
        note || undefined, idempotencyKey),
    onSuccess: () => {
      track('order_rejected', { screen: SCREEN, entityId: orderId }, { reason });
      invalidate();
      setMode('view');
      toast.show('Order declined', 'info');
      router.replace('/supplier/orders');
    },
    onError: (caught) => onRefusal(caught, 'Could not decline this order.'),
  });

  const advance = useMutation({
    // A fresh key per transition, not the screen's: `preparing` and `ready` are
    // two different operations, and reusing one key would make the second look
    // like a replay of the first.
    mutationFn: (to: 'preparing' | 'ready') =>
      to === 'preparing'
        ? markPreparing(accessToken as string, orderId, newIdempotencyKey())
        : markReady(accessToken as string, orderId, newIdempotencyKey()),
    onSuccess: (_data, to) => {
      track(to === 'ready' ? 'order_ready' : 'order_preparing', { screen: SCREEN, entityId: orderId });
      invalidate();
    },
    onError: (caught) => onRefusal(caught, 'Could not update this order.'),
  });

  // Every line must be answered — an omitted line is unanswered, not declined
  // (doc 04 §11). So the map is seeded with the full requested quantity and the
  // supplier reduces what they cannot supply.
  const partialItems = useMemo<PartialAcceptItem[]>(() => {
    if (!order) return [];
    return order.items.map((item) => ({
      supplierOrderItemId: item.id,
      acceptedQuantity: String(accepted[item.id] ?? Number(item.requestedQuantity)),
    }));
  }, [order, accepted]);

  /**
   * What the order comes to at the quantities currently on screen.
   *
   * <p>Asked of the server rather than worked out here: it is money, and
   * guardrail 3 puts every rupee of arithmetic on the far side of the wire. The
   * endpoint prices it with the same code the acceptance runs, so what is shown
   * and what happens cannot drift apart.
   *
   * <p>Only while the partial screen is open, and keyed by the quantities, so
   * moving a stepper re-asks and moving it back is served from cache.
   */
  const preview = useQuery({
    queryKey: ['supplier-order', orderId, 'partial-preview', partialItems],
    queryFn: ({ signal }) =>
      previewPartialAccept(accessToken as string, orderId, partialItems, signal),
    enabled: mode === 'partial' && partialItems.length > 0 && accessToken != null,
    // The previous figures stay on screen while the next ones are in flight,
    // so the totals do not blink to nothing between taps.
    placeholderData: (previous) => previous,
  });

  /**
   * Answered, and for less than was asked. Only then do two sets of figures
   * exist; before an answer `acceptedAmount` is zero and means "not yet".
   */
  const settled = order != null
    && order.acceptedAmount != null
    && order.items.some((item) => item.acceptedQuantity != null)
    && Number(order.acceptedAmount) !== Number(order.totalAmount);

  const anyReduced = useMemo(
    () => order != null && order.items.some(
      (item) => (accepted[item.id] ?? Number(item.requestedQuantity)) < Number(item.requestedQuantity),
    ),
    [order, accepted],
  );

  const pending = order?.status === 'PENDING_ACCEPTANCE';

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={order?.outletName ?? 'Order'}
          subtitle={order?.restaurantName ?? undefined}
          back
          right={
            // Only while quantities have been changed: a reset that resets
            // nothing is a button that does nothing.
            mode === 'partial' && Object.keys(accepted).length > 0 ? (
              <MandiHeaderAction
                icon="refresh-outline"
                label="Reset quantities"
                onPress={() => setConfirmingReset(true)}
              />
            ) : undefined
          }
        />
      }
      footer={renderFooter()}
    >
      {/* Worth confirming: the quantities are typed one line at a time and
          there is no way back to them once they are gone. */}
      <MandiConfirm
        visible={confirmingReset}
        title="Start again?"
        message="Every line goes back to the quantity the restaurant asked for."
        confirmLabel="Reset quantities"
        cancelLabel="Keep what I entered"
        onConfirm={() => {
          setAccepted({});
          setConfirmingReset(false);
        }}
        onCancel={() => setConfirmingReset(false)}
      />

      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || order == null ? (
        <MandiErrorState message="Couldn't load this order." onRetry={() => query.refetch()} />
      ) : (
        <>
          <MandiCard>
            {/* Where it is going, then what it is called and how it is paid for.
                The supplier is deciding inside a sixty-second window, and the
                first of those is the one they cannot look up later. */}
            <View style={styles.row}>
              <View style={styles.where}>
                <MandiText variant="bodyEmphasis" numberOfLines={2}>
                  {[order.outletLocality, order.outletCity].filter(Boolean).join(', ')
                    || order.outletName}
                </MandiText>
                {formatDistance(order.distanceKm) ? (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {formatDistance(order.distanceKm)} from your store
                  </MandiText>
                ) : null}
              </View>
              <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} />
            </View>
            {/* The same two columns as the card, so a supplier who tapped
                through finds the four facts where they already were. */}
            <View style={styles.columns}>
              <View style={styles.left}>
                <PaymentMethodPill method={order.paymentMethod} />
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {order.orderNumber}
                </MandiText>
              </View>
              <View style={styles.right}>
                <MandiText variant="price">{formatMoney(orderValue(order))}</MandiText>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {order.items.length} item{order.items.length === 1 ? '' : 's'}
                </MandiText>
              </View>
            </View>

            {/* Full width rather than in a column: it is a sentence, and squeezed
                into half the card it wraps into three lines. */}
            <MandiText variant="caption" color={Colors.textTertiary}>
              Placed {formatMoment(order.createdAt)}
            </MandiText>
            {pending && order.acceptanceDeadline && (
              <View style={styles.deadline}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Respond within
                </MandiText>
                <MandiCountdown
                  deadlineAt={order.acceptanceDeadline}
                  slaSeconds={order.responseSlaSeconds ?? undefined}
                  size="lg"
                />
              </View>
            )}
          </MandiCard>

          {mode === 'reject' ? (
            <RejectPanel
              reason={reason}
              onReason={setReason}
              note={note}
              onNote={setNote}
            />
          ) : (
            <MandiCard>
              <MandiText variant="bodyEmphasis">
                {mode === 'partial' ? 'What can you supply?' : 'Items'}
              </MandiText>
              {order.items.map((item) => {
                const requested = Number(item.requestedQuantity);
                const value = accepted[item.id] ?? requested;
                return (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.itemHead}>
                      {/* 44pt, not the card's 26: on the detail screen the
                          supplier is checking they have the right thing, and a
                          picture too small to recognise is decoration. */}
                      <ProductThumb uri={item.productImageUrl} size={44} />
                      <View style={styles.itemText}>
                        <MandiText variant="body">{item.productName}</MandiText>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {item.skuName} · {formatMoney(item.unitPrice)} per {item.unit} · GST{' '}
                          {formatGstRate(item.gstRate)}
                        </MandiText>
                      </View>
                      {/* What this line is worth now. In partial mode that is
                          the quantity being chosen; afterwards it is what was
                          committed to. The ordered figure stays, struck, because
                          the difference is the point. */}
                      <LineValue
                        ordered={item.lineTotal}
                        settled={
                          mode === 'partial'
                            ? previewLine(preview.data, item.id)
                            : item.acceptedLineTotal
                        }
                      />
                    </View>

                    {mode === 'partial' ? (
                      <View style={styles.itemFoot}>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          Asked for {formatQuantity(item.requestedQuantity)} {item.unit}
                        </MandiText>
                        <MandiQuantityStepper
                          value={value}
                          onChange={(next) =>
                            setAccepted((current) => ({ ...current, [item.id]: next }))
                          }
                          min={0}
                          max={requested}
                          unit={item.unit}
                        />
                      </View>
                    ) : (
                      <View style={styles.quantities}>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {formatQuantity(item.requestedQuantity)} {item.unit} asked for
                        </MandiText>
                        {/* What was committed to, when it is not what was asked.
                            It was a clause on the end of the requested quantity in
                            the same grey — the one line on the screen that says
                            this order is not what it looks like, set as an aside.
                            It is what the packer has to read. */}
                        {item.acceptedQuantity != null
                          && Number(item.acceptedQuantity) !== requested && (
                            <View style={styles.shortRow}>
                              <Ionicons
                                name="alert-circle-outline"
                                size={14}
                                color={Colors.warning}
                              />
                              <MandiText variant="captionEmphasis" color={Colors.warning}>
                                {Number(item.acceptedQuantity) === 0
                                  ? 'You declined this line'
                                  : `You accepted ${formatQuantity(item.acceptedQuantity)} ${item.unit}`}
                              </MandiText>
                            </View>
                          )}
                      </View>
                    )}
                  </View>
                );
              })}
            </MandiCard>
          )}

          {mode === 'partial' && anyReduced && (
            <MandiCard>
              <MandiFormField
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="Anything they should know"
              />
            </MandiCard>
          )}

          <MandiCard>
            {mode === 'partial' && preview.data != null ? (
              <>
                <Row label="Subtotal" value={formatMoney(preview.data.acceptedValue)} />
                <Row label="GST" value={formatMoney(preview.data.acceptedGst)} />
                <Row
                  label="You would supply"
                  value={formatMoney(preview.data.acceptedTotal)}
                  emphasis
                />
                {anyReduced && preview.data.anyAccepted && (
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    Ordered {formatMoney(order.totalAmount)}. You are only charged for what you
                    accept.
                  </MandiText>
                )}
              </>
            ) : settled ? (
              // Answered, and for less than was asked. The ordered figures are
              // kept struck rather than dropped: a supplier checking what they
              // committed to also needs to see what they were asked for.
              <>
                <Row
                  label="Subtotal"
                  value={formatMoney(order.acceptedSubtotal)}
                  was={formatMoney(order.subtotal)}
                />
                <Row
                  label="GST"
                  value={formatMoney(order.acceptedGst)}
                  was={formatMoney(order.gstAmount)}
                />
                <Row
                  label="You supply"
                  value={formatMoney(order.acceptedAmount)}
                  was={formatMoney(order.totalAmount)}
                  emphasis
                />
              </>
            ) : (
              <>
                <Row label="Subtotal" value={formatMoney(order.subtotal)} />
                <Row label="GST" value={formatMoney(order.gstAmount)} />
                <Row label="Order value" value={formatMoney(order.totalAmount)} emphasis />
              </>
            )}
          </MandiCard>
        </>
      )}
    </MandiScreen>
  );

  function renderFooter() {
    if (order == null) return undefined;

    if (mode === 'reject') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Decline this order"
            size="lg"
            variant="destructive"
            disabled={reason == null}
            loading={reject.isPending}
            onPress={() => reject.mutate()}
          />
          <MandiButton label="Back" variant="neutral" size="md" onPress={() => setMode('view')} />
        </MandiStickyBar>
      );
    }

    if (mode === 'partial') {
      return (
        <MandiStickyBar>
          {/* Nothing left to supply is a decline, and the server records it as
              one. Rather than disabling the button and explaining why, the button
              becomes the thing it would actually do — and goes to the screen that
              asks for a reason, which a decline needs and this one would lose. */}
          {preview.data != null && !preview.data.anyAccepted ? (
            <MandiButton
              label="Decline this order"
              size="lg"
              variant="destructive"
              onPress={() => setMode('reject')}
            />
          ) : (
            <MandiButton
              label="Send partial acceptance"
              size="lg"
              loading={partial.isPending}
              onPress={() => partial.mutate(partialItems)}
            />
          )}
          <MandiButton label="Back" variant="neutral" size="md" onPress={() => setMode('view')} />
        </MandiStickyBar>
      );
    }

    if (pending) {
      return (
        <MandiStickyBar>
          {/* One answer leads and two are available, and the colours say so.
              All three were brand-coloured, which is what `neutral` exists to
              stop: "a row of orange buttons reads as a row of warnings", and on
              a screen with a countdown on it that is the wrong thing to say
              three times. Accept in full is the answer most orders get; taking
              part of it is still accepting, so it keeps the outline; declining
              is the way out and is weighted like one. */}
          <MandiButton
            label="Accept in full"
            size="lg"
            icon="checkmark-circle-outline"
            loading={accept.isPending}
            onPress={() => accept.mutate()}
          />
          <View style={styles.secondaryRow}>
            <MandiButton
              label="Accept part"
              variant="secondary"
              size="md"
              onPress={() => setMode('partial')}
              style={styles.flex}
            />
            {/* Neutral rather than destructive: this opens the decline screen,
                where a reason is required. Nothing is refused by this tap. */}
            <MandiButton
              label="Decline"
              variant="neutral"
              size="md"
              onPress={() => setMode('reject')}
              style={styles.flex}
            />
          </View>
        </MandiStickyBar>
      );
    }

    if (order.status === 'CONFIRMED' || order.status === 'PARTIALLY_ACCEPTED') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Start preparing"
            size="lg"
            loading={advance.isPending}
            onPress={() => advance.mutate('preparing')}
          />
        </MandiStickyBar>
      );
    }

    if (order.status === 'PREPARING') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Ready for pickup"
            size="lg"
            loading={advance.isPending}
            onPress={() => advance.mutate('ready')}
          />
        </MandiStickyBar>
      );
    }

    return undefined;
  }
}

function RejectPanel({
  reason,
  onReason,
  note,
  onNote,
}: {
  reason: RejectionReason | null;
  onReason: (reason: RejectionReason) => void;
  note: string;
  onNote: (note: string) => void;
}) {
  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">Why are you declining?</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary}>
        This is required. It goes to the restaurant so they can source elsewhere, and it is
        counted — &ldquo;out of stock&rdquo; and &ldquo;store closed&rdquo; are different problems.
      </MandiText>
      <View style={styles.reasons}>
        {REASONS.map((option) => {
          const active = option.key === reason;
          return (
            <Pressable
              key={option.key}
              onPress={() => onReason(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.reason, active && styles.reasonActive]}
            >
              {active && <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />}
              <MandiText
                variant="caption"
                color={active ? Colors.primary : Colors.textSecondary}
              >
                {option.label}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
      <MandiFormField
        label="Note (optional)"
        value={note}
        onChangeText={onNote}
        placeholder="Anything that helps them understand"
      />
    </MandiCard>
  );
}

function Row({
  label,
  value,
  was,
  emphasis,
}: {
  label: string;
  value: string;
  /** What this was before the supplier answered. Struck, and only when it differs. */
  was?: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.totalsRow}>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
        {label}
      </MandiText>
      <View style={styles.totalsValue}>
        {was != null && was !== value && (
          <MandiText variant="caption" color={Colors.textTertiary} struck>{was}</MandiText>
        )}
        <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
      </View>
    </View>
  );
}

/**
 * A line's value, with the ordered figure struck when it no longer applies.
 *
 * <p>Both figures, never one: the new number alone leaves a supplier wondering
 * whether they misread the order, and the old one alone is a lie.
 */
function LineValue({ ordered, settled }: { ordered: string; settled?: string | null }) {
  const changed = settled != null && settled !== ordered;
  return (
    <View style={styles.lineValue}>
      {changed && (
        <MandiText variant="caption" color={Colors.textTertiary} struck>
          {formatMoney(ordered)}
        </MandiText>
      )}
      <MandiText variant="bodyEmphasis">{formatMoney(settled ?? ordered)}</MandiText>
    </View>
  );
}

/** This line's value at the quantity being offered, when the server has priced it. */
function previewLine(
  preview: PartialAcceptPreview | undefined,
  itemId: number,
): string | undefined {
  return preview?.lines.find((line) => line.supplierOrderItemId === itemId)?.lineTotal;
}

const styles = StyleSheet.create({
  where: { flex: 1, gap: 2 },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  left: { flex: 1, gap: 2, alignItems: 'flex-start' },
  right: { gap: 2, alignItems: 'flex-end' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  deadline: { marginTop: Spacing.md, gap: Spacing.xs },
  item: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  itemText: { flex: 1, gap: Spacing.xs },
  itemFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  quantities: { gap: Spacing.xs, alignItems: 'flex-start' },
  shortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  totalsValue: { alignItems: 'flex-end' },
  lineValue: { alignItems: 'flex-end' },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  secondaryRow: { flexDirection: 'row', gap: Spacing.sm },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reasonActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
