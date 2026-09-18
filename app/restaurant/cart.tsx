import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRequestBasket, useInvalidateBasket } from '@/hooks/useRequestBasket';
import { removeIntentItem, sendBasket, updateIntentItem } from '@/services/intent';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiBottomSheet,
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiIconButton,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import type { HeldRequest, Intent } from '@/models/intent';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { skuSecondaryLine, skuTitle } from '@/utils/skuLabel';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-CART-01';

/**
 * The basket — one request per supplier, sent in one action. D-088, D-090.
 *
 * <p><b>The prices here are real.</b> They are the supplier's current price, and
 * sending locks them: the supplier's reply confirms that figure or declines the
 * line, and the order is created on the same number. So nothing here is hedged
 * with a tilde — a figure somebody is about to commit to should not be labelled
 * "approximately".
 *
 * <p>What makes that honest is the check before sending. If a supplier has
 * repriced since an item was added, that request is <b>held</b> and the change
 * shown, old and new, to be accepted — §23A.16, and the reason the number can be
 * trusted the rest of the time.
 *
 * <p><b>It is a basket, so it persists.</b> Leaving without sending changes
 * nothing: the drafts live on the server, and reopening reloads them at whatever
 * the prices are then.
 */
export default function BasketScreen() {
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { basket, drafts, loading, error, refetch } = useRequestBasket();
  const invalidate = useInvalidateBasket();

  const [held, setHeld] = useState<HeldRequest[] | null>(null);

  const update = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: number; quantity: string }) =>
      updateIntentItem(accessToken as string, itemId, quantity),
    onSuccess: () => void invalidate(),
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not update that.', 'error'),
  });

  const remove = useMutation({
    mutationFn: (itemId: number) => removeIntentItem(accessToken as string, itemId),
    onSuccess: () => void invalidate(),
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not remove that.', 'error'),
  });

  const send = useMutation({
    mutationFn: (acceptPriceChanges: boolean) =>
      sendBasket(accessToken as string, outletId as number, { acceptPriceChanges }),
    onSuccess: (result) => {
      track('basket_sent', { screen: SCREEN, outletId }, { sent: result.sent.length });
      void invalidate();

      if (result.held.length > 0) {
        // Shown rather than sent. The unaffected requests have already gone,
        // which is why this is a sheet over a still-useful screen rather than an
        // error that loses the whole action.
        setHeld(result.held);
        return;
      }

      setHeld(null);
      const only = result.sent.length === 1 ? result.sent[0] : undefined;
      if (only != null) {
        // Straight to the one request, since there is nothing to choose between.
        router.replace(`/restaurant/requests/${only.id}`);
      } else {
        toast.show(`${result.sent.length} requests sent`, 'success');
        router.replace('/restaurant/(tabs)/requests');
      }
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error'),
  });

  const empty = drafts.length === 0;

  return (
    <MandiScreen
      header={<MandiHeader title="Your requests" back />}
      onRefresh={() => refetch()}
      footer={
        empty || basket == null ? undefined : (
          <MandiStickyBar>
            <View style={styles.totalRow}>
              <View style={styles.flex}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {basket.itemCount} item{basket.itemCount === 1 ? '' : 's'} ·{' '}
                  {basket.supplierCount} supplier{basket.supplierCount === 1 ? '' : 's'}
                </MandiText>
                {!basket.pricedComplete && (
                  <MandiText variant="caption" color={Colors.warning}>
                    Some items have no price
                  </MandiText>
                )}
              </View>
              <MandiText variant="priceLarge">{formatMoney(basket.agreedTotal)}</MandiText>
            </View>
            {/* One button for the lot, which still creates a separate request
                per supplier — each is its own conversation and becomes its own
                order, so the label counts them rather than pretending it is one
                thing. */}
            <MandiButton
              label={
                basket.supplierCount === 1
                  ? 'Send request'
                  : `Send ${basket.supplierCount} requests`
              }
              size="lg"
              loading={send.isPending}
              onPress={() => send.mutate(false)}
            />
          </MandiStickyBar>
        )
      }
    >
      {loading ? (
        <MandiSkeletonList count={3} />
      ) : error ? (
        <MandiErrorState message="Couldn't load your requests." onRetry={() => refetch()} />
      ) : empty ? (
        <MandiEmptyState
          icon="cart-outline"
          title="Nothing here yet"
          description="Find what you need and add it. You'll send a request to each supplier, and only pay once they confirm what they can supply."
          actionLabel="Start searching"
          onAction={() => router.push('/restaurant/search')}
        />
      ) : (
        <>
          <View style={styles.intro}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textTertiary} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              These are the prices your suppliers will confirm. Nothing is charged until
              they reply and you place the order.
            </MandiText>
          </View>

          {drafts.map((draft, index) => (
            <SupplierRequest
              key={draft.id}
              draft={draft}
              sequence={index + 1}
              onChangeQuantity={(itemId, quantity) => update.mutate({ itemId, quantity })}
              onRemove={(itemId) => remove.mutate(itemId)}
            />
          ))}
        </>
      )}

      <PriceChangeSheet
        held={held}
        accepting={send.isPending}
        onAccept={() => send.mutate(true)}
        onDismiss={() => setHeld(null)}
      />
    </MandiScreen>
  );
}

/** One supplier's request: its number, their branch, its lines and its total. */
function SupplierRequest({
  draft,
  sequence,
  onChangeQuantity,
  onRemove,
}: {
  draft: Intent;
  sequence: number;
  onChangeQuantity: (itemId: number, quantity: string) => void;
  onRemove: (itemId: number) => void;
}) {
  return (
    <MandiCard>
      <View style={styles.supplierRow}>
        {/* Numbered because one action sends several, and "the second one was
            held" needs something to point at. */}
        <View style={styles.sequence}>
          <MandiText variant="caption" color={Colors.surface}>{sequence}</MandiText>
        </View>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis" numberOfLines={1}>
            {draft.storeName ?? 'Supplier'}
          </MandiText>
          {draft.supplierName != null && draft.supplierName !== draft.storeName && (
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {draft.supplierName}
            </MandiText>
          )}
        </View>
        <MandiText variant="caption" color={Colors.textTertiary}>
          {draft.items.length} item{draft.items.length === 1 ? '' : 's'}
        </MandiText>
      </View>

      {draft.items.map((item) => (
        <View key={item.id} style={styles.item}>
          <ProductThumb uri={item.sku?.imageUrl} size={44} />
          <View style={styles.itemText}>
            <MandiText variant="body" numberOfLines={1}>
              {skuTitle(item.sku)}
            </MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {skuSecondaryLine(item.sku)}
            </MandiText>
            <MandiQuantityStepper
              value={Number(item.requestedQuantity)}
              onChange={(quantity) => onChangeQuantity(item.id, String(quantity))}
              min={0}
              unit={item.unit}
              itemLabel={skuTitle(item.sku)}
            />
          </View>

          <View style={styles.lineAmount}>
            {item.agreedLineTotal != null ? (
              <>
                <MandiText variant="bodyEmphasis">
                  {formatMoney(item.agreedLineTotal)}
                </MandiText>
                {item.agreedUnitPrice != null && (
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    {formatMoney(item.agreedUnitPrice)} each
                  </MandiText>
                )}
                {/* Flagged here as well as at send: somebody scanning the basket
                    should see which line moved without having to ask. */}
                {item.priceChanged && item.previousUnitPrice != null && (
                  <MandiText variant="caption" color={Colors.warning}>
                    was {formatMoney(item.previousUnitPrice)}
                  </MandiText>
                )}
              </>
            ) : (
              // No live offer behind this line. Said plainly rather than shown as
              // zero, which would read as free.
              <MandiText variant="caption" color={Colors.warning}>
                No price
              </MandiText>
            )}
          </View>

          <MandiIconButton
            icon="close"
            accessibilityLabel={`Remove ${skuTitle(item.sku)}`}
            onPress={() => onRemove(item.id)}
          />
        </View>
      ))}

      {draft.agreedTotal != null && (
        <View style={styles.cardTotals}>
          <Row label="Items" value={formatMoney(draft.agreedValue ?? '0')} />
          <Row label="GST" value={formatMoney(draft.agreedGst ?? '0')} />
          <Row label="Total" value={formatMoney(draft.agreedTotal)} emphasis />
          {!draft.pricedComplete && (
            <MandiText variant="caption" color={Colors.warning}>
              One or more items have no current price, so this is less than the whole.
            </MandiText>
          )}
        </View>
      )}
    </MandiCard>
  );
}

/**
 * The prices that moved, and the decision about them.
 *
 * <p>Old and new for every line, because §23A.16 asks for the change to be
 * shown rather than described. Requests that were not affected have already gone
 * by the time this appears, and the copy says so — discovering afterwards that
 * two of three went out is worse than either outcome on its own.
 */
function PriceChangeSheet({
  held,
  accepting,
  onAccept,
  onDismiss,
}: {
  held: HeldRequest[] | null;
  accepting: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  if (held == null || held.length === 0) {
    return null;
  }

  return (
    <MandiBottomSheet visible title="Prices have changed" onClose={onDismiss}>
      <MandiText variant="caption" color={Colors.textSecondary}>
        {held.length === 1 ? 'This supplier has' : 'These suppliers have'} repriced since
        you added the items, so nothing has been sent to{' '}
        {held.length === 1 ? 'them' : 'any of them'} yet.
      </MandiText>

      <ScrollView style={styles.sheetScroll}>
        {held.map((request) => (
          <View key={request.intentId} style={styles.heldBlock}>
            <MandiText variant="bodyEmphasis" numberOfLines={1}>
              {request.storeName ?? request.reference}
            </MandiText>
            {request.changes.map((change) => (
              <View key={change.intentItemId} style={styles.changeRow}>
                <MandiText variant="body" style={styles.flex} numberOfLines={1}>
                  {change.productName ?? 'Item'}
                </MandiText>
                <View style={styles.changeAmounts}>
                  <MandiText variant="caption" color={Colors.textTertiary} struck>
                    {formatMoney(change.previousUnitPrice)}
                  </MandiText>
                  <MandiText variant="bodyEmphasis">
                    {formatMoney(change.currentUnitPrice)}
                  </MandiText>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <MandiButton label="Accept and send" size="lg" loading={accepting} onPress={onAccept} />
      <MandiButton label="Keep in basket" variant="tertiary" size="md" onPress={onDismiss} />
    </MandiBottomSheet>
  );
}

function Row({ label, value, emphasis }: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
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
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.md,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  sequence: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  itemText: { flex: 1, gap: Spacing.xs },
  lineAmount: { alignItems: 'flex-end', gap: 2, minWidth: 84 },
  cardTotals: { gap: Spacing.xs, paddingTop: Spacing.md, marginTop: Spacing.md },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sheetScroll: { maxHeight: 280 },
  heldBlock: { gap: Spacing.xs, marginTop: Spacing.md },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  changeAmounts: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
