import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { cancelIntent, cloneIntent, createOrderFromIntent, fetchIntent } from '@/services/intent';
import { intentKey, orderPaymentKey } from '@/lib/queryKeys';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiCountdown,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import type { IntentItem } from '@/models/intent';
import { IntentFulfilment as FulfilmentDisplay, resolveStatus, restaurantIntentStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-REQ-02';

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

  const query = useQuery({
    queryKey: intentKey(intentId),
    queryFn: () => fetchIntent(accessToken as string, intentId),
    enabled: Number.isFinite(intentId) && accessToken != null,
    // An unanswered request is changing under us; a finished one is not.
    refetchInterval: (q) => (q.state.data?.status === 'OPEN' ? 15_000 : false),
  });

  const request = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: intentKey(intentId) });

  const order = useMutation({
    mutationFn: () => createOrderFromIntent(accessToken as string, intentId),
    onSuccess: (created) => {
      track('intent_ordered', { screen: SCREEN, entityId: intentId });
      void refresh();
      // Navigate to the authoritative state rather than claiming success here.
      // If payment is still outstanding the payment screen is where it belongs;
      // a toast saying "ordered" would be the app deciding something the backend
      // has not confirmed (guardrail 4).
      if (created.payment != null) {
        // Handed over rather than re-fetched: the provider order id is minted
        // once, at creation, and asking for it again would arrange funding twice.
        queryClient.setQueryData(orderPaymentKey(created.supplierOrderId), created.payment);
        router.replace(`/restaurant/pay/${created.supplierOrderId}`);
      } else {
        // Credit funds inside the creating transaction, so there is nothing to pay.
        router.replace(`/restaurant/orders/${created.supplierOrderId}`);
      }
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not create that order.', 'error'),
  });

  const cancel = useMutation({
    mutationFn: () => cancelIntent(accessToken as string, intentId),
    onSuccess: () => { void refresh(); toast.show('Request withdrawn', 'success'); },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not withdraw that.', 'error'),
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
      header={<MandiHeader title={request?.reference ?? 'Request'} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={renderActions()}
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
                <MandiText variant="bodyEmphasis">{request.storeName}</MandiText>
                {request.supplierName != null && request.supplierName !== request.storeName && (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {request.supplierName}
                  </MandiText>
                )}
              </View>
              <MandiStatusChip {...restaurantIntentStatus(request.status, request.fulfilment)} />
            </View>

            {/* Only once answered: before that the status chip above already
                says "awaiting", and a second chip repeating it is noise. */}
            {request.fulfilment !== 'AWAITING' && (
              <View style={styles.fulfilmentRow}>
                <MandiStatusChip {...resolveStatus(FulfilmentDisplay, request.fulfilment)} />
              </View>
            )}

            {/* The supplier's clock, while it is theirs. Shown so a kitchen can
                decide whether to keep waiting or go elsewhere, rather than
                refreshing a screen that says only "waiting". */}
            {request.status === 'OPEN' && request.responseDeadline != null && (
              <View style={styles.countdown}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {request.storeName ?? 'This supplier'} usually accepts within
                </MandiText>
                <MandiCountdown
                  deadlineAt={request.responseDeadline}
                  slaSeconds={request.responseWindowSeconds ?? undefined}
                  action="to accept"
                  onExpire={() => void refresh()}
                />
              </View>
            )}

            {request.status === 'RESPONSES_RECEIVED' && request.orderCreationDeadline && (
              <View style={styles.countdown}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Order from this reply within
                </MandiText>
                <MandiCountdown
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

          <MandiCard>
            <MandiText variant="bodyEmphasis">Items</MandiText>
            {request.items.map((item) => (
              <RequestLine key={item.id} item={item} answered={request.acceptance != null} />
            ))}
          </MandiCard>

          {request.acceptance == null && request.agreedTotal != null && (
            <MandiCard>
              <Row label="Items" value={formatMoney(request.agreedValue ?? '0')} />
              <Row label="GST" value={formatMoney(request.agreedGst ?? '0')} />
              <Row
                label="If they accept it all"
                value={formatMoney(request.agreedTotal)}
                hint="This is the price they will confirm. Delivery is quoted separately once a courier is assigned."
                emphasis
              />
            </MandiCard>
          )}

          {request.acceptance != null && (
            <MandiCard>
              {/* Only real once the supplier has answered. Before that there is
                  no price on this request at all. */}
              <Row label="Item value" value={formatMoney(request.acceptance.offeredValue)} />
              <Row label="GST" value={formatMoney(request.acceptance.offeredGst)} />
              <Row
                label="If you order everything"
                value={formatMoney(request.acceptance.offeredTotal)}
                hint="Delivery is quoted once a courier is assigned, and is not in this total."
                emphasis
              />
              {request.acceptance.etaMinutes != null && (
                <Row label="Estimated delivery" value={`${request.acceptance.etaMinutes} min`} />
              )}
              {request.acceptance.notes != null && (
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.note}>
                  “{request.acceptance.notes}”
                </MandiText>
              )}
            </MandiCard>
          )}
        </>
      )}

      <MandiConfirm
        visible={confirmCancel}
        title="Withdraw this request?"
        message="The supplier will no longer see it. You can send a new one any time."
        confirmLabel="Withdraw"
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

    const orderable =
      request.status === 'RESPONSES_RECEIVED'
      && request.withinOrderWindow
      && request.fulfilment !== 'NOT_FULFILLED';

    const withdrawable = request.status === 'OPEN' || request.status === 'RESPONSES_RECEIVED';
    const repeatable = request.status !== 'DRAFT' && request.status !== 'OPEN';

    if (!orderable && !withdrawable && !repeatable) return undefined;

    return (
      <MandiStickyBar>
        {orderable && (
          <>
            <View style={styles.barRow}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                You pay
              </MandiText>
              <MandiText variant="priceLarge">
                {formatMoney(request.acceptance?.offeredTotal ?? '0')}
              </MandiText>
            </View>
            <MandiButton
              label="Create order"
              size="lg"
              loading={order.isPending}
              onPress={() => order.mutate()}
            />
          </>
        )}
        {!orderable && repeatable && (
          <MandiButton
            label="Ask again"
            size="lg"
            loading={repeat.isPending}
            onPress={() => repeat.mutate()}
          />
        )}
        {withdrawable && (
          <MandiButton
            label="Withdraw request"
            variant="tertiary"
            size="md"
            onPress={() => setConfirmCancel(true)}
          />
        )}
      </MandiStickyBar>
    );
  }
}

/**
 * One line: what was asked for, and what came back.
 *
 * <p>Requested and offered sit side by side rather than one replacing the other.
 * A shortfall is a fact about the request, and showing only the offered figure
 * cannot tell anybody what they asked for.
 */
function RequestLine({ item, answered }: { item: IntentItem; answered: boolean }) {
  const short =
    item.offeredQuantity != null
    && Number(item.offeredQuantity) < Number(item.requestedQuantity);
  const declined = item.offeredQuantity != null && Number(item.offeredQuantity) === 0;

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
          Asked for {formatQuantity(item.requestedQuantity)} {item.unit}
        </MandiText>

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
              Only {formatQuantity(item.offeredQuantity)} {item.unit} available
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
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fulfilmentRow: { flexDirection: 'row', marginTop: Spacing.md },
  countdown: { marginTop: Spacing.md, gap: Spacing.xs },
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
  itemText: { flex: 1, gap: Spacing.xs },
  lineNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  lineValue: { alignItems: 'flex-end', gap: 2 },
  note: { marginTop: Spacing.md, fontStyle: 'italic' },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
});
