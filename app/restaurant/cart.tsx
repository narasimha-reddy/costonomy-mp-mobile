import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRequestBasket, useInvalidateBasket } from '@/hooks/useRequestBasket';
import { removeIntentItem, sendIntent, updateIntentItem } from '@/services/intent';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
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
import type { Intent } from '@/models/intent';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-CART-01';

/**
 * The basket — one request per supplier. D-088.
 *
 * <p><b>There are no prices on this screen, and that is the point.</b> A request
 * says what this kitchen wants; what it costs is the supplier's answer. The old
 * cart showed a total and took payment against it, then let the supplier reduce
 * the order afterwards — so the total was a guess, and the order paid for was not
 * the order received. Showing a figure here would be the app inventing one
 * (guardrail 3), and it would be wrong as often as stock is short.
 *
 * <p>Each supplier is sent separately, because each is a separate conversation.
 * There is no combined "checkout": the money step happens later, once per
 * request, on the screen where the supplier's actual prices are shown.
 */
export default function BasketScreen() {
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { basket, drafts, loading, error, refetch } = useRequestBasket();
  const invalidate = useInvalidateBasket();

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
    mutationFn: (intentId: number) => sendIntent(accessToken as string, intentId),
    onSuccess: (intent) => {
      track('intent_sent', { screen: SCREEN, outletId, entityId: intent.id });
      void invalidate();
      toast.show('Request sent', 'success');
      router.push(`/restaurant/requests/${intent.id}`);
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
                {/* "About", always. This is the sum of today's listed prices,
                    and what a supplier actually quotes may differ -- calling it
                    a total would make it a promise the app cannot keep. */}
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {basket.indicativeComplete
                    ? 'Estimate at current prices'
                    : 'Estimate — some items have no price'}
                </MandiText>
              </View>
              <MandiText variant="priceLarge">
                ~{formatMoney(basket.indicativeTotal)}
              </MandiText>
            </View>
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
              You&apos;re asking, not buying. Each supplier replies with what they have and
              what it costs — you pay only after that, and only for what you order.
            </MandiText>
          </View>

          {drafts.map((draft) => (
            <SupplierRequest
              key={draft.id}
              draft={draft}
              onChangeQuantity={(itemId, quantity) => update.mutate({ itemId, quantity })}
              onRemove={(itemId) => remove.mutate(itemId)}
              onSend={() => send.mutate(draft.id)}
              sending={send.isPending && send.variables === draft.id}
            />
          ))}
        </>
      )}
    </MandiScreen>
  );
}

/** One supplier's request: their branch, their lines, and one Send. */
function SupplierRequest({
  draft,
  onChangeQuantity,
  onRemove,
  onSend,
  sending,
}: {
  draft: Intent;
  onChangeQuantity: (itemId: number, quantity: string) => void;
  onRemove: (itemId: number) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <MandiCard>
      {/* The branch leads and the business follows, as everywhere else. */}
      <View style={styles.supplierRow}>
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
          <ProductThumb uri={item.imageUrl} size={44} />
          <View style={styles.itemText}>
            <MandiText variant="body" numberOfLines={1}>
              {item.productName ?? item.skuName ?? 'Item'}
            </MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {skuSecondaryLine(item.productName, item.skuName, item.packLabel)}
            </MandiText>
            <MandiQuantityStepper
              value={Number(item.requestedQuantity)}
              onChange={(quantity) => onChangeQuantity(item.id, String(quantity))}
              min={0}
              unit={item.unit}
              itemLabel={item.productName ?? 'item'}
            />
          </View>

          <View style={styles.lineAmount}>
            {item.indicativeLineTotal != null ? (
              <>
                <MandiText variant="bodyEmphasis">
                  ~{formatMoney(item.indicativeLineTotal)}
                </MandiText>
                {item.indicativeUnitPrice != null && (
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    {formatMoney(item.indicativeUnitPrice)} each
                  </MandiText>
                )}
              </>
            ) : (
              // No live offer behind this line. Said plainly rather than shown
              // as zero, which would read as free.
              <MandiText variant="caption" color={Colors.warning}>
                No price
              </MandiText>
            )}
          </View>
          {/* A sibling of the row rather than inside it: a button nested in a
              pressable is invalid on web and swallows its own taps. */}
          <MandiIconButton
            icon="close"
            accessibilityLabel={`Remove ${item.productName ?? 'item'}`}
            onPress={() => onRemove(item.id)}
          />
        </View>
      ))}

      {/* This supplier's own estimate. Per card because each card is sent
          separately and becomes its own order -- a kitchen deciding whether to
          send this one needs this one's figure, not the basket's. */}
      {draft.indicativeTotal != null && (
        <View style={styles.cardTotals}>
          <Row label="Items" value={`~${formatMoney(draft.indicativeValue ?? '0')}`} />
          <Row label="GST" value={`~${formatMoney(draft.indicativeGst ?? '0')}`} />
          <Row
            label="Estimated total"
            value={`~${formatMoney(draft.indicativeTotal)}`}
            emphasis
          />
          {!draft.indicativeComplete && (
            <MandiText variant="caption" color={Colors.warning}>
              One or more items have no current price, so this is less than the whole.
            </MandiText>
          )}
        </View>
      )}

      <View style={styles.sendRow}>
        <MandiText variant="caption" color={Colors.textTertiary} style={styles.flex}>
          Nothing is charged until they reply and you order.
        </MandiText>
        <MandiButton
          label="Send request"
          size="md"
          loading={sending}
          onPress={onSend}
        />
      </View>
    </MandiCard>
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
  cardTotals: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
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
  },
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
});
