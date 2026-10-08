import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import {
  cancelIntent,
  cloneIntent,
  removeIntentItem,
  createOrderFromIntent,
  fetchIntent,
  updateIntentItem,
  previewOrder,
} from '@/services/intent';
import { intentKey, orderPaymentKey } from '@/lib/queryKeys';
import { ProductThumb } from '@/components/product/ProductThumb';
import { StickyActionBar } from '@/components/common/StickyActionBar';
import { DetailRowCard } from '@/components/common/DetailRowCard';
import { fetchAvailableSlots } from '@/services/delivery';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiCountdown,
  MandiErrorState,
  MandiChatAction,
  MandiHeader,
  MandiIconButton,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import type { IntentItem } from '@/models/intent';
import type { DeliveryMode } from '@/models/procurement';
import { DeliveryModePicker } from '@/components/request/DeliveryModePicker';
import { DeliverySlotPicker } from '@/components/request/DeliverySlotPicker';
import { describeDeliveryDay, istDay } from '@/lib/delivery/deliveryDay';
import { PaymentMethodPicker, type PaymentMethod } from '@/components/request/PaymentMethodPicker';
import { PAYMENT_METHOD_LABEL } from '@/components/request/paymentLabels';
import { getJsonPreference, removePreference, setJsonPreference } from '@/lib/preferences';
import { IntentFulfilment as FulfilmentDisplay, resolveStatus, restaurantIntentStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { newIdempotencyKey } from '@/lib/api/client';
import { formatGstRate, formatMoney, formatQuantity, type Money } from '@/utils/money';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { skuSecondaryLine, skuTitle } from '@/utils/skuLabel';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';
import { CatchWeightNote } from '@/components/order';
import { feeNeedsRefreshing } from '@/lib/delivery/quoteMessages';

const SCREEN = 'REST-REQ-02';

/** What the restaurant has chosen on this screen, kept per request so a reload or a trip back does not reset it. */
interface SavedCheckout {
  mode: DeliveryMode | null;
  slotId: number | null;
  scheduledDate: string | null;
  method: PaymentMethod | null;
}
const checkoutKey = (intentId: number) => `checkout:request:${intentId}`;

/**
 * One request, and the decision at the end of it. D-088.
 *
 * <p>The shape of this screen follows the architecture: what was asked, what the
 * supplier said they could supply, and — only once they have said it — what it
 * would cost to order. Before a reply there are no prices on this screen at all,
 * because none exist.
 *
 * <p>The header carries only the reference: the card below leads with the branch
 * and its business, and repeating the store name two lines above it would push
 * the status further down the screen.
 *
 * <p><b>The countdown is the server's instant.</b> `orderCreationDeadline` comes
 * from the API and `MandiCountdown` recomputes from it rather than decrementing
 * locally, so the one number the restaurant is acting on matches the one the
 * backend will enforce.
 */
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const intentId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  /**
   * Quantities being edited, keyed by line id, or null when not editing.
   *
   * <p>Held locally until Save rather than written per tap: a stepper on a live
   * request would otherwise fire a request per press at a supplier who is
   * reading the list, and there would be no moment the restaurant could decide
   * the change was wrong and back out of it.
   */
  const [edits, setEdits] = React.useState<Record<number, number> | null>(null);

  const query = useQuery({
    queryKey: intentKey(intentId),
    queryFn: () => fetchIntent(accessToken as string, intentId),
    enabled: Number.isFinite(intentId) && accessToken != null,
    // An unanswered request is changing under us; a finished one is not.
    refetchInterval: (q) => (q.state.data?.status === 'OPEN' ? 15_000 : false),
  });

  const request = query.data;

  // Whether there is something to order right now; only then do the checkout choices matter or get kept.
  const orderableNow = request != null
    && request.status === 'RESPONSES_RECEIVED'
    && request.withinOrderWindow
    && request.fulfilment !== 'NOT_FULFILLED';

  /**
   * The chosen mode, its fee, and the quote that fee came from. D-091.
   *
   * <p>Held here rather than in the picker because the bar below has to show
   * what the restaurant will actually pay, and creating the order has to spend
   * the same quote the fee was read from.
   */
  const [delivery, setDelivery] = React.useState<{
    mode: DeliveryMode;
    fee: Money;
    quoteReference?: string;
  } | null>(null);

  // No slot and no day is as soon as possible, which is where it starts unless the request was sent for a day.
  const [slot, setSlot] = React.useState<{
    slotId: number | null;
    scheduledDate: string | null;
  }>({
    slotId: null,
    scheduledDate: null,
  });

  // Start the slot picker on the day the buyer asked for when sending, unless that day has gone by.
  // Once, and only if they have not already picked a day here.
  const askedDay = request?.preferredDeliveryDate ?? null;
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (askedDay == null || prefilled.current) return;
    prefilled.current = true;
    if (askedDay >= istDay(0)) setSlot({ slotId: null, scheduledDate: askedDay });
  }, [askedDay]);

  /**
   * How this will be paid for. Chosen here, like the delivery mode, because
   * both decide what happens the moment the order exists — a card sends the
   * kitchen to a checkout, a wallet and a line of credit settle on the spot.
   */
  const [method, setMethod] = React.useState<PaymentMethod | null>(null);

  /**
   * Choices from an earlier visit to this request. Read once before the pickers mount, so the pickers start from
   * them instead of from their defaults; `restoredMode` is handed to the delivery picker, which re-quotes the fee
   * rather than trusting a saved one (a quote expires). Cleared once the order is placed.
   */
  const [restored, setRestored] = React.useState(false);
  const [replyExpired, setReplyExpired] = React.useState(false);
  const [restoredMode, setRestoredMode] = React.useState<DeliveryMode | null>(null);
  // Handed to the payment picker, which only takes it up once the balances say it can still be used.
  const [restoredMethod, setRestoredMethod] = React.useState<PaymentMethod | null>(null);
  const orderPlaced = React.useRef(false);
  React.useEffect(() => {
    if (!Number.isFinite(intentId)) return;
    let live = true;
    void getJsonPreference<Partial<SavedCheckout> | null>(checkoutKey(intentId), null).then((saved) => {
      if (!live) return;
      if (saved != null && typeof saved === 'object') {
        if (saved.mode != null) setRestoredMode(saved.mode);
        // What was chosen wins over the day the request was sent for; a day that has gone by is as soon as possible.
        // Only the day comes back: the slot is the picker's to choose from what the supplier has free today, since a
        // saved slot may since have filled up or gone.
        const dayHolds = typeof saved.scheduledDate === 'string' && saved.scheduledDate >= istDay(0);
        prefilled.current = true;
        setSlot({ slotId: null, scheduledDate: dayHolds ? saved.scheduledDate ?? null : null });
        if (saved.method != null) setRestoredMethod(saved.method);
      }
    }).catch(() => {
      // Storage that fails is as good as nothing saved: the pickers still start from their defaults.
    }).finally(() => {
      if (live) setRestored(true);
    });
    return () => { live = false; };
  }, [intentId]);

  // Save what is chosen, once the saved choices have been read (or the first render would overwrite them).
  // Kept only while there is an order to place: a request that is open, closed or long gone has nothing to remember.
  const requestLoaded = request != null;
  React.useEffect(() => {
    if (!restored || orderPlaced.current || !requestLoaded) return;
    if (!orderableNow) {
      void removePreference(checkoutKey(intentId));
      return;
    }
    const choices: SavedCheckout = {
      mode: delivery?.mode ?? restoredMode,
      slotId: slot.slotId,
      scheduledDate: slot.scheduledDate,
      method: method ?? restoredMethod,
    };
    void setJsonPreference(checkoutKey(intentId), choices);
  }, [restored, requestLoaded, orderableNow, delivery?.mode, slot.slotId, slot.scheduledDate, method, restoredMode, restoredMethod, intentId]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: intentKey(intentId) });

  // Where the payment picker sits, so the bar's method column can scroll to it. Presentation only.
  const [pickerY, setPickerY] = React.useState(0);
  // The same for the mode and slot pickers and the totals card, for the rows near the top.
  const [modeY, setModeY] = React.useState(0);
  const [slotY, setSlotY] = React.useState(0);
  const [totalsY, setTotalsY] = React.useState(0);
  const [pickerScroll, setPickerScroll] = React.useState<{ y: number; token: number } | null>(null);
  const scrollTo = (y: number) => setPickerScroll((current) => ({ y, token: (current?.token ?? 0) + 1 }));

  // The chosen slot's hours, for the header and the delivery row. Same key as the picker's own query, so one fetch.
  const slotsQuery = useQuery({
    queryKey: ['available-slots', request?.supplierStoreId, slot.scheduledDate],
    queryFn: () => fetchAvailableSlots(accessToken as string, request?.supplierStoreId as number, slot.scheduledDate as string),
    enabled: accessToken != null && request != null && slot.slotId != null && slot.scheduledDate != null,
  });
  const chosenSlot = slotsQuery.data?.find((s) => s.id === slot.slotId);
  const windowText = deliveryWindowText(delivery?.mode ?? null, slot, chosenSlot);

  /**
   * What this order comes to, carriage included, computed by the server.
   *
   * <p>Re-asked whenever the chosen mode changes, because the mode is what the
   * fee depends on. The alternative — adding the delivery fee to the acceptance
   * total here — is arithmetic on money, which guardrail 3 puts on the server
   * precisely so two already-rounded figures cannot drift from the order they
   * describe.
   */
  const preview = useQuery({
    queryKey: [...intentKey(intentId), 'preview', delivery?.mode ?? null,
      delivery?.quoteReference ?? null],
    queryFn: () => previewOrder(accessToken as string, intentId, {
      deliveryMode: delivery?.mode,
      deliveryQuoteReference: delivery?.quoteReference,
    }),
    enabled: accessToken != null
      && request?.status === 'RESPONSES_RECEIVED'
      && request.withinOrderWindow,
  });

  /**
   * One idempotency key per "order this, this way".
   *
   * <p>It used to be minted inside each call, so a double tap — or the client's
   * own retry — reached the server as a second order. The first had already
   * spent the delivery quote, and the second was refused with "that delivery
   * quote belongs to a different request" while the order had in fact been
   * placed (D-099). The key now lives as long as the choices it was made for:
   * a change of mode or method is a different order and gets a new one, and so
   * does a retry after the server refused.
   */
  const orderKey = React.useRef<string | null>(null);
  const ordering = React.useRef(false);
  React.useEffect(() => {
    orderKey.current = null;
  }, [delivery?.mode, delivery?.quoteReference, slot.slotId, slot.scheduledDate, method]);

  const order = useMutation({
    mutationFn: (key: string) => createOrderFromIntent(accessToken as string, intentId, {
      deliveryMode: (delivery?.mode ?? 'PICKUP') as DeliveryMode,
      deliveryQuoteReference: delivery?.quoteReference,
      // Collecting has no slot and no day, whatever was picked before switching to it.
      deliverySlotId: delivery?.mode === 'PICKUP' ? undefined : slot.slotId ?? undefined,
      scheduledDeliveryDate: delivery?.mode === 'PICKUP' ? undefined : slot.scheduledDate ?? undefined,
      paymentMethod: method ?? 'PREPAID',
    }, key),
    onSettled: () => {
      ordering.current = false;
    },
    onSuccess: (created) => {
      track('intent_ordered', { screen: SCREEN, entityId: intentId });
      // Placed: these choices belong to an order that now exists, not to the next visit.
      orderPlaced.current = true;
      void removePreference(checkoutKey(intentId));
      void refresh();
      // Navigate to the authoritative state rather than claiming success here.
      // If payment is still outstanding the payment screen is where it belongs;
      // a toast saying "ordered" would be the app deciding something the backend
      // has not confirmed (guardrail 4).
      if (created.payment != null) {
        // Handed over so the pay screen can open at once; it confirms with the
        // server either way (D-102).
        queryClient.setQueryData(orderPaymentKey(created.supplierOrderId), created.payment);
        router.replace(`/restaurant/pay/${created.supplierOrderId}`);
      } else if (created.paymentMethod === 'PREPAID' && created.paymentStatus === 'PENDING') {
        // Unpaid with no checkout in the response — an older server's "already
        // ordered" answer. The pay screen asks for it rather than the order
        // being left with no way to pay.
        router.replace(`/restaurant/pay/${created.supplierOrderId}`);
      } else {
        // Credit and wallet settle inside the creating transaction, so there is nothing to pay:
        // land on the tracking screen, which opens on the "order placed" state.
        router.replace(`/restaurant/tracking/${created.supplierOrderId}`);
      }
    },
    onError: (caught) => {
      // A refusal is final for that attempt, so trying again is a new one. A
      // network failure is not: the order may exist, and the same key finds it.
      //
      // Two refusals are not final: "still in progress" means the first request
      // is being handled under this very key, and a rate limit means try later.
      // Minting a new key for either made the next tap a second order (D-102).
      if (caught instanceof ApiError && caught.status < 500
        && caught.code !== 'IDEMPOTENT_REQUEST_IN_PROGRESS' && caught.status !== 429) {
        orderKey.current = null;
      }
      // The fee shown is no longer the right one (the goods have become chilled since it was quoted): ask for it
      // again and make the restaurant choose again, rather than leave a choice standing that the server will refuse.
      if (feeNeedsRefreshing(caught)) {
        // The re-quote starts first; the picker will not choose delivery again until the new figure is in.
        void queryClient.invalidateQueries({ queryKey: ['delivery-quote', intentId] });
        setDelivery(null);
      }
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not create that order.', 'error');
    },
  });

  const placeOrder = () => {
    // Ignore a second tap in the same moment, before the button shows it is busy.
    if (ordering.current) return;
    ordering.current = true;
    orderKey.current ??= newIdempotencyKey();
    order.mutate(orderKey.current);
  };

  const cancel = useMutation({
    mutationFn: () => cancelIntent(accessToken as string, intentId),
    onSuccess: () => { void refresh(); toast.show('Request withdrawn', 'success'); },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not withdraw that.', 'error'),
  });

  /**
   * Save the edited quantities.
   *
   * <p>Sequential rather than parallel, and it stops at the first refusal. The
   * server takes one line at a time, and the refusal worth stopping for is the
   * supplier having answered mid-edit — once that is true of one line it is true
   * of all of them, and firing the rest would produce a row of identical errors.
   *
   * <p>Whatever happens the screen is refetched, because some lines may have
   * been written before the refusal and the totals are the server's to state.
   */
  /**
   * Remove one line while the request is still unanswered.
   *
   * <p>Applied straight away rather than held until Save: a removal is not a
   * number being adjusted, it is a decision, and leaving it pending would mean
   * Cancel silently restoring something the person had visibly deleted.
   *
   * <p>The server refuses the last line — a request may shrink while a supplier
   * reads it, but an empty one is a clock running against nothing.
   */
  const removeLine = useMutation({
    mutationFn: (itemId: number) => removeIntentItem(accessToken as string, itemId),
    onSuccess: (updated) => {
      void refresh();
      // Re-seed the edits from what came back, so the steppers match the lines
      // that are actually left.
      setEdits(Object.fromEntries(
        updated.items.map((line) => [line.id, Number(line.requestedQuantity)]),
      ));
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not remove that.', 'error'),
  });

  const saveQuantities = useMutation({
    mutationFn: async (changed: { itemId: number; quantity: number }[]) => {
      for (const line of changed) {
        await updateIntentItem(accessToken as string, line.itemId, String(line.quantity));
      }
    },
    onSuccess: (_result, changed) => {
      track('request_quantities_edited', { screen: SCREEN, entityId: intentId }, { lines: changed.length });
      setEdits(null);
      void refresh();
      toast.show(
        changed.length === 1 ? 'Quantity updated' : `${changed.length} quantities updated`,
        'success',
      );
    },
    onError: (caught) => {
      // Leave edit mode either way: the server has rejected this list, and the
      // refetch below replaces it with whatever is now true. Keeping the
      // steppers open over stale numbers would invite the same failing save.
      setEdits(null);
      void refresh();
      toast.show(
        caught instanceof ApiError
          ? caught.message
          : 'Could not save those quantities. Check your connection and try again.',
        'error',
      );
    },
  });

  const repeat = useMutation({
    mutationFn: () => cloneIntent(accessToken as string, intentId),
    onSuccess: () => {
      toast.show('Copied into a new request', 'success');
      router.push('/restaurant/cart');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not copy that.', 'error'),
  });

  return (
    <MandiScreen
      header={
        <MandiHeader
          // The kind leads and the number identifies. "RQ-260919-000022" as a
          // title made every request screen look the same at a glance and told
          // a reader nothing they could not get from the card they tapped.
          title="Request"
          subtitle={request?.reference ?? undefined}
          back
          right={
            <MandiChatAction
              outletId={request?.outletId}
              supplierStoreId={request?.supplierStoreId}
              side="RESTAURANT"
              // What this conversation is about, offered for sharing once the
              // thread opens rather than assumed.
              suggest={request == null ? undefined : { type: 'REQUEST', id: request.id }}
            />
          }
        />
      }
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={renderActions()}
      scrollTarget={pickerScroll}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || request == null ? (
        <MandiErrorState message="Couldn't load this request." onRetry={() => query.refetch()} />
      ) : (
        <>
          {orderableNow && (
            <MandiCard testID="checkout-header">
              <MandiText variant="captionEmphasis" color={Colors.textSecondary} numberOfLines={1}>
                {request.storeName}
              </MandiText>
              <MandiText variant="bodyEmphasis" color={Colors.trackHeader} numberOfLines={1}>
                {windowText}
              </MandiText>
              <MandiText variant="body" numberOfLines={1}>
                {delivery?.mode === 'PICKUP'
                  ? `Pickup at ${request.storeName}`
                  : `to ${[request.outletName, request.outletLocality].filter(Boolean).join(' · ')}`}
              </MandiText>
              {/* The reply's clock moved here from the status card below. The small chip carries no
                  trailing "to order" (it wrapped under the time); its spoken label still says it. */}
              {request.orderCreationDeadline && (
                <View style={styles.headerTimer}>
                  <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1} style={styles.flex}>
                    Order from this reply within
                  </MandiText>
                  <MandiCountdown
                    size="sm"
                    tone="ready"
                    deadlineAt={request.orderCreationDeadline}
                    slaSeconds={request.orderCreationWindowSeconds ?? undefined}
                    action="to order"
                    onExpire={() => void refresh()}
                  />
                </View>
              )}
              <MandiText variant="caption" color={Colors.textTertiary}>
                The supplier is holding this stock until then.
              </MandiText>
            </MandiCard>
          )}

          <MandiCard>
            {/* Status first. What a kitchen checks on opening this screen is
                whether the supplier has answered yet — the store name is
                already known, since they chose it. Wrapped so the chip keeps
                its own width instead of stretching the card. */}
            {/* Both chips on one line. They answer two different questions —
                where the request is, and how much of it was available — and
                stacked they read as one thing restated rather than two facts. */}
            <View style={styles.statusRow}>
              {/* "Cancelled" read as something that happened to the request; the restaurant withdrew it. */}
              <MandiStatusChip
                {...(request.status === 'CANCELLED'
                  ? { label: 'Request withdrawn', tone: 'neutral' as const }
                  : restaurantIntentStatus(request.status, request.fulfilment))}
              />
              {/* One chip when they say the same thing: "Accepted in part" already is "Partly available". */}
              {request.fulfilment !== 'AWAITING'
                && !(request.status === 'RESPONSES_RECEIVED' && request.fulfilment !== 'FULFILLED') && (
                <MandiStatusChip {...resolveStatus(FulfilmentDisplay, request.fulfilment)} />
              )}
            </View>

            {/* When it was actually asked for. sentAt, not createdAt: a draft
                may have sat in the basket for a day, and what both sides date
                this request from is the moment it went out. */}
            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatMomentWithRecency(request.sentAt ?? request.createdAt)}
            </MandiText>
            {/* Through to the supplier's shelf, as on an order. */}
            {/* At checkout the header card above already names the supplier; a second card for the same one is noise. */}
            {!orderableNow && (
            <Pressable
              onPress={() => router.push(`/restaurant/supplier/${request.supplierStoreId}`)}
              accessibilityRole="button"
              accessibilityLabel={`See everything ${request.storeName} sells`}
              style={({ pressed }) => [styles.partyRow, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis">{request.storeName}</MandiText>
                {request.supplierName != null
                  && request.supplierName !== request.storeName && (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {request.supplierName}
                  </MandiText>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </Pressable>
            )}

            {/* What was asked for, on the screen that confirms the request went. */}
            {request.status === 'OPEN' && (
              <MandiText variant="caption" color={Colors.textSecondary} testID="request-asked">
                {requestedHow(request.deliveryPreference, request.preferredDeliveryDate)}
              </MandiText>
            )}

            {/* The supplier's clock, while it is theirs. Shown so a kitchen can
                decide whether to keep waiting or go elsewhere, rather than
                refreshing a screen that says only "waiting". */}
            {request.status === 'OPEN' && request.responseDeadline != null && (
              <View style={styles.replyRow}>
                {/* One idea: how long they have to reply, and how much of that is left. */}
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {request.responseWindowSeconds != null
                    ? `${request.storeName} replies within ${Math.max(1, Math.round(request.responseWindowSeconds / 60))} min ·`
                    : `${request.storeName} will reply soon ·`}
                </MandiText>
                <MandiCountdown
                  size="sm"
                  deadlineAt={request.responseDeadline}
                  slaSeconds={request.responseWindowSeconds ?? undefined}
                  action="to reply"
                  onExpire={() => { setReplyExpired(true); void refresh(); }}
                />
                {/* The clock's own label already says "left"; this word is for the eye only. */}
                {!replyExpired && (
                  <MandiText variant="caption" color={Colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no">
                    left
                  </MandiText>
                )}
              </View>
            )}

            {!orderableNow && request.status === 'RESPONSES_RECEIVED' && request.orderCreationDeadline && (
              <View style={styles.countdown}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Order from this reply within
                </MandiText>
                <MandiCountdown
                  tone="ready"
                  deadlineAt={request.orderCreationDeadline}
                  slaSeconds={request.orderCreationWindowSeconds ?? undefined}
                  action="to order"
                  onExpire={() => void refresh()}
                />
                <MandiText variant="caption" color={Colors.textTertiary}>
                  The supplier is holding this stock until then.
                </MandiText>
              </View>
            )}

            {request.status === 'CANCELLED' && (
              <View style={styles.countdown}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  The supplier no longer sees this request. You can send a new one any time.
                </MandiText>
                <MandiButton
                  label="Back to Home"
                  variant="secondary"
                  size="md"
                  onPress={() => router.replace('/restaurant')}
                />
              </View>
            )}
            {request.status === 'ORDER_CREATION_EXPIRED' && (
              <Note
                icon="time-outline"
                tone={Colors.warning}
                text="This reply expired before an order was created. Send the request again to get a fresh one."
              />
            )}
            {request.status === 'EXPIRED' && (
              <Note
                icon="alert-circle-outline"
                tone={Colors.danger}
                text="The supplier didn't accept in time. Try another supplier for these items."
              />
            )}
          </MandiCard>

          {/* Only once there is something to order. Asking how it should travel
              while the supplier has not answered would be asking about goods
              nobody has agreed to supply. */}
          {request.status === 'RESPONSES_RECEIVED'
            && request.withinOrderWindow
            && request.fulfilment !== 'NOT_FULFILLED' && (
            <>
              {/* Not before the saved choices are read: the pickers start from their defaults otherwise. */}
              {restored && (
              <>
              <View onLayout={(e) => setModeY(e.nativeEvent.layout.y)}>
                <DeliveryModePicker
                  request={request}
                  selected={delivery?.mode ?? null}
                  initialMode={restoredMode}
                  onSelect={(mode, fee, quoteReference) =>
                    setDelivery({ mode, fee, quoteReference })}
                />
              </View>
              {delivery?.mode !== 'PICKUP' && (
                <View onLayout={(e) => setSlotY(e.nativeEvent.layout.y)}>
                  <DeliverySlotPicker
                    supplierStoreId={request.supplierStoreId}
                    selectedSlotId={slot.slotId}
                    selectedDate={slot.scheduledDate}
                    onSelect={(slotId, scheduledDate) => setSlot({ slotId, scheduledDate })}
                  />
                </View>
              )}
              {/* Below delivery, because the amount it has to cover depends on
                  the mode: a wallet that covers a collected order may not cover
                  the same order with a courier on it. */}
              <View onLayout={(e) => setPickerY(e.nativeEvent.layout.y)}>
                <PaymentMethodPicker
                  outletId={request.outletId}
                  supplierStoreId={request.supplierStoreId}
                  amount={preview.data?.grandTotal ?? request.acceptance?.offeredTotal}
                  selected={method}
                  initialMethod={restoredMethod}
                  onSelect={setMethod}
                />
              </View>
              </>
              )}
              {/* The bar below is the order button only, so withdrawing sits with the choices. */}
              <MandiButton
                label="Withdraw Request"
                variant="tertiary"
                size="lg"
                onPress={() => setConfirmCancel(true)}
              />
            </>
          )}

          <MandiCard>
            <View style={styles.itemsHeader}>
              <MandiText variant="bodyEmphasis">Items</MandiText>
              {/* The server decides whether this is offered at all: true through
                  OPEN, false the moment the supplier answers (D-088). Reading
                  the flag rather than the status keeps the rule in one place. */}
              {request.quantityEditable && edits == null && (
                <MandiButton
                  label="Edit"
                  variant="tertiary"
                  size="sm"
                  onPress={() => {
                    setEdits(
                      Object.fromEntries(
                        request.items.map((i) => [i.id, Number(i.requestedQuantity)]),
                      ),
                    );
                  }}
                />
              )}
            </View>

            {edits != null && (
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.editHint}>
                {request.status === 'OPEN'
                  ? 'Change what you need and save. The supplier has not answered yet, '
                    + 'and their time to accept is unchanged.'
                  : 'Change what you need and save.'}
              </MandiText>
            )}

            {request.items.map((item) => (
              <RequestLine
                key={item.id}
                item={item}
                answered={request.acceptance != null}
                editQuantity={edits?.[item.id]}
                onChangeQuantity={(quantity) =>
                  setEdits((current) =>
                    current == null ? current : { ...current, [item.id]: quantity })
                }
                onOpenSku={() => router.push(`/restaurant/sku/${item.supplierSkuId}`)}
                // No delete on the last line: the server refuses it, and an
                // action that always fails should not be offered.
                onDelete={request.items.length > 1
                  ? () => removeLine.mutate(item.id)
                  : undefined}
              />
            ))}
          </MandiCard>

          {orderableNow && (
            <>
              {/* No "Add more items" here: the supplier has answered this request, so more items would be a new one. */}
              <View testID="checkout-rows">
                <DetailRowCard
                  rows={[
                    {
                      key: 'window',
                      icon: 'time-outline',
                      title: 'Delivery window',
                      subtitle: windowText,
                      onPress: () => scrollTo(delivery?.mode === 'PICKUP' ? modeY : slotY || modeY),
                    },
                    {
                      key: 'address',
                      icon: 'location-outline',
                      title: delivery?.mode === 'PICKUP'
                        ? `Collect from ${request.storeName}`
                        : `Delivery at ${request.outletName ?? 'your outlet'}`,
                      subtitle: delivery?.mode === 'PICKUP'
                        ? null
                        : [request.outletLocality, request.outletCity].filter(Boolean).join(', ') || null,
                    },
                    {
                      key: 'total',
                      icon: 'receipt-outline',
                      title: `Total bill ${formatMoney(preview.data?.grandTotal ?? request.acceptance?.offeredTotal ?? '0')}`,
                      subtitle: 'Incl. taxes and charges',
                      onPress: () => scrollTo(totalsY),
                    },
                  ]}
                />
              </View>
            </>
          )}

          {request.acceptance == null && request.agreedTotal != null && (
            <MandiCard>
              <Row label="Items" value={formatMoney(request.agreedValue ?? '0')} />
              <Row label="GST" value={formatMoney(request.agreedGst ?? '0')} />
              <Row label="Total" value={formatMoney(request.agreedTotal)} emphasis />
            </MandiCard>
          )}

          {request.acceptance != null && (
            <View onLayout={(e) => setTotalsY(e.nativeEvent.layout.y)}>
            <MandiCard>
              {/* Only real once the supplier has answered. Before that there is
                  no price on this request at all. */}
              <Row label="Item value" value={formatMoney(request.acceptance.offeredValue)} />
              <Row label="GST" value={formatMoney(request.acceptance.offeredGst)} />
              {/* Whoever carries it, the charge is a line the restaurant sees before ordering: the supplier's own fee, or
                  Costonomy's quoted fee. Free delivery says so; a pickup has no delivery line at all. */}
              {preview.data != null && Number(preview.data.deliveryFee) > 0 && (
                <Row label="Delivery" value={formatMoney(preview.data.deliveryFee)} />
              )}
              {preview.data != null && Number(preview.data.deliveryFee) === 0
                && delivery != null && delivery.mode !== 'PICKUP' && (
                <Row label="Delivery" value="Free" />
              )}
              <Row
                label="Total"
                value={formatMoney(preview.data?.grandTotal ?? request.acceptance.offeredTotal)}
                emphasis
              />
              {(preview.data?.lines ?? []).some((line) => line.isCatchWeight === true) && <CatchWeightNote />}
              {request.acceptance.notes != null && (
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
                  “{request.acceptance.notes}”
                </MandiText>
              )}
            </MandiCard>
            </View>
          )}
        </>
      )}

      <MandiConfirm
        visible={confirmCancel}
        title="Withdraw this request?"
        message="The supplier will no longer see it. You can send a new one any time."
        confirmLabel="Withdraw"
        // Nothing to edit once answered, so "keep editing" would promise something this sheet cannot give.
        cancelLabel={request?.quantityEditable ? 'Keep editing' : 'Keep request'}
        destructive
        onConfirm={() => { setConfirmCancel(false); cancel.mutate(); }}
        onCancel={() => setConfirmCancel(false)}
      />
    </MandiScreen>
  );

  /**
   * What the restaurant can do next, decided by what the server says this is.
   *
   * <p>Never by what the app last did — an order button offered because a reply
   * arrived a moment ago would still be there after the window closed.
   */
  function renderActions() {
    if (request == null) return undefined;

    // Editing owns the bar while it is open. Offering "Create order" or
    // "Withdraw" beside unsaved quantities would ask which of the two the
    // restaurant meant, and one of the answers loses their edit silently.
    if (edits != null) {
      const changed = request.items
        .filter((i) => edits[i.id] != null && edits[i.id] !== Number(i.requestedQuantity))
        .map((i) => ({ itemId: i.id, quantity: edits[i.id] as number }));

      return (
        <MandiStickyBar>
          <MandiButton
            label={changed.length === 0 ? 'Save' : `Save ${changed.length === 1 ? 'change' : `${changed.length} changes`}`}
            size="lg"
            disabled={changed.length === 0}
            loading={saveQuantities.isPending}
            onPress={() => saveQuantities.mutate(changed)}
          />
          <MandiButton
            label="Cancel"
            variant="tertiary"
            size="md"
            disabled={saveQuantities.isPending}
            onPress={() => setEdits(null)}
          />
        </MandiStickyBar>
      );
    }

    const orderable =
      request.status === 'RESPONSES_RECEIVED'
      && request.withinOrderWindow
      && request.fulfilment !== 'NOT_FULFILLED';

    const withdrawable = request.status === 'OPEN' || request.status === 'RESPONSES_RECEIVED';
    const repeatable = request.status !== 'DRAFT' && request.status !== 'OPEN';

    if (!orderable && !withdrawable && !repeatable) return undefined;

    // Answered and orderable: the pay bar. The amount is the server's preview, falling back to the
    // acceptance total the same way the totals card does; nothing here adds money.
    if (orderable) {
      return (
        <StickyActionBar
          variant="pay"
          left={{
            eyebrow: 'PAY USING',
            label: method == null ? 'Choose a method' : PAYMENT_METHOD_LABEL[method],
            onPress: () => scrollTo(pickerY),
          }}
          amount={formatMoney(preview.data?.grandTotal ?? request.acceptance?.offeredTotal ?? '0')}
          amountCaption="TOTAL"
          ctaLabel="Place order"
          // Until both are chosen there is no fee and no funding, and an
          // order cannot be created without either.
          disabled={delivery == null || method == null}
          loading={order.isPending}
          onPress={placeOrder}
        />
      );
    }

    return (
      <MandiStickyBar>
        {/* Side by side: the two things a kitchen can do with an answered
            request are opposites, and stacking them put the destructive one
            directly under the thumb that had just reached for the other. */}
        <View style={styles.barActions}>
          {withdrawable && (
            <MandiButton
              label="Withdraw Request"
              variant="tertiary"
              size="lg"
              style={styles.barAction}
              onPress={() => setConfirmCancel(true)}
            />
          )}
          {repeatable && (
            <MandiButton
              label="Ask Again"
              size="lg"
              style={styles.barAction}
              loading={repeat.isPending}
              onPress={() => repeat.mutate()}
            />
          )}
        </View>
      </MandiStickyBar>
    );
  }
}

/** What was asked for when the request was sent: "Deliver to me · As soon as possible", "Pickup · Tomorrow". */
function requestedHow(preference: 'DELIVERY' | 'PICKUP', day: string | null): string {
  const how = preference === 'DELIVERY' ? 'Deliver to me' : 'Pickup';
  const when = day == null ? 'As soon as possible'
    : day === istDay(0) ? 'Later today'
      : day === istDay(1) ? 'Tomorrow' : describeDeliveryDay(day);
  return `${how} · ${when}`;
}

/** Where and when it arrives, in words: pickup, as soon as possible, or the day and the slot's hours. */
function deliveryWindowText(
  mode: DeliveryMode | null,
  slot: { slotId: number | null; scheduledDate: string | null },
  chosen: { startTime: string; endTime: string } | undefined,
): string {
  if (mode === 'PICKUP') return 'Collect when ready';
  if (slot.scheduledDate == null) return 'As soon as possible';
  const day = slot.scheduledDate === istDay(0) ? 'Today'
    : slot.scheduledDate === istDay(1) ? 'Tomorrow'
      : slot.scheduledDate === istDay(2) ? 'In 2 days' : slot.scheduledDate;
  return chosen == null ? day : `${day} · ${chosen.startTime.substring(0, 5)} - ${chosen.endTime.substring(0, 5)}`;
}

/**
 * One line: what was asked for, and what came back.
 *
 * <p>Requested and offered sit side by side rather than one replacing the other.
 * A shortfall is a fact about the request, and showing only the offered figure
 * cannot tell anybody what they asked for.
 */
function RequestLine({
  item,
  answered,
  editQuantity,
  onChangeQuantity,
  onDelete,
  onOpenSku,
}: {
  item: IntentItem;
  answered: boolean;
  /** Set only while editing; the live value for this line's stepper. */
  editQuantity?: number;
  onChangeQuantity?: (quantity: number) => void;
  /** Absent when this is the last line: a sent request may shrink, not empty. */
  onDelete?: () => void;
  /** Open the pack's own page. D-096. */
  onOpenSku: () => void;
}) {
  const editing = editQuantity != null && onChangeQuantity != null;
  const short =
    item.offeredQuantity != null
    && Number(item.offeredQuantity) < Number(item.requestedQuantity);
  const declined = item.offeredQuantity != null && Number(item.offeredQuantity) === 0;

  return (
    <View style={styles.item}>
      {/* The picture and the name open the pack (D-096); the stepper below
          stays the row's control, so the two never compete for a tap. */}
      <Pressable
        onPress={onOpenSku}
        accessibilityRole="button"
        accessibilityLabel={`About ${skuTitle(item.sku)}`}
        hitSlop={4}
      >
        <ProductThumb uri={item.sku?.imageUrl} size={44} />
      </Pressable>
      <View style={styles.itemText}>
        <Pressable
          onPress={onOpenSku}
          accessibilityRole="button"
          accessibilityLabel={`About ${skuTitle(item.sku)}`}
        >
          <MandiText variant="body" numberOfLines={1}>
            {skuTitle(item.sku)}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>
            {skuSecondaryLine(item.sku, item.agreedUnitPriceInclusiveGst)}
          </MandiText>
        </Pressable>
        {/* The same frame in both states, with the controls only when they do
            something. A quantity that changes shape when Edit is pressed makes
            the eye re-find the number it was already looking at. */}
        <View style={styles.quantityRow}>
          <MandiQuantityStepper
            // Answered: what the supplier will actually send, so a shortfall is not shown as a box that says more.
            // What was asked for is said underneath.
            value={editing ? editQuantity : answered && item.offeredQuantity != null && !declined
              ? Number(item.offeredQuantity)
              : Number(item.requestedQuantity)}
            onChange={onChangeQuantity ?? (() => undefined)}
            // min 1: a sent request cannot be emptied by stepping to zero, and
            // the server refuses it — deleting a line or withdrawing the request
            // is what removes things (D-088).
            min={1}
            unit={item.unit}
            size="sm"
            readOnly={!editing}
            itemLabel={skuTitle(item.sku)}
            testID={`request-qty-${item.id}`}
          />
          {editing && onDelete != null && (
            <MandiIconButton
              icon="trash-outline"
              color={Colors.danger}
              accessibilityLabel={`Remove ${skuTitle(item.sku)}`}
              onPress={onDelete}
            />
          )}
        </View>

        {declined && (
          <View style={styles.lineNote}>
            <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
            <MandiText variant="caption" color={Colors.danger}>
              Not available
            </MandiText>
          </View>
        )}
        {short && !declined && (
          <View style={styles.lineNote}>
            <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
            <MandiText variant="caption" color={Colors.warning}>
              You asked for {formatQuantity(item.requestedQuantity)} {item.unit}
            </MandiText>
          </View>
        )}
      </View>

      {/* Once answered, what the supplier committed to. Before that, what the
          request was sent at — the same price they will confirm, so there is no
          reason to leave the column blank while waiting. */}
      {!declined && (answered ? item.lineTotal : item.agreedLineTotal) != null && (
        <View style={styles.lineValue}>
          <MandiText variant="bodyEmphasis">
            {formatMoney((answered ? item.lineTotal : item.agreedLineTotal) as string)}
          </MandiText>
          {(answered ? item.gstRate : item.agreedGstRate) != null && (
            <MandiText variant="caption" color={Colors.textTertiary}>
              Inc. {formatGstRate((answered ? item.gstRate : item.agreedGstRate) as string)} GST
            </MandiText>
          )}
          {item.sku?.isCatchWeight === true && <CatchWeightNote />}
        </View>
      )}
    </View>
  );
}

function Note({ icon, tone, text }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  text: string;
}) {
  return (
    <View style={styles.noteRow}>
      <Ionicons name={icon} size={16} color={tone} />
      <MandiText variant="caption" color={tone} style={styles.flex}>{text}</MandiText>
    </View>
  );
}

function Row({ label, value, emphasis, hint }: {
  label: string;
  value: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.totalsRow}>
      <View style={styles.flex}>
        <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
          {label}
        </MandiText>
        {hint && <MandiText variant="caption" color={Colors.textTertiary}>{hint}</MandiText>}
      </View>
      <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  // flex-start so the chip sizes to its label rather than filling the card.
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  headerTimer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  countdown: { marginTop: Spacing.md, gap: Spacing.xs },
  replyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md },
  noteRow: {
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
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  editHint: { marginTop: Spacing.xs },
  itemText: { flex: 1, gap: Spacing.xs },
  lineNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  lineValue: { alignItems: 'flex-end', gap: 2 },
  note: { marginTop: Spacing.md, fontStyle: 'italic' },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  barActions: { flexDirection: 'row', gap: Spacing.sm },
  barAction: { flex: 1 },
});
