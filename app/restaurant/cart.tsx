import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useCart, useInvalidateCart } from '@/hooks/useCart';
import { removeCartItem, updateCartItem } from '@/services/procurement';
import { PriceChangeNotice } from '@/components/procurement/PriceChangeNotice';
import { TotalsPanel } from '@/components/procurement/TotalsPanel';
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
import { ApiError } from '@/lib/api/errors';
import { placeLabel } from '@/utils/placeName';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-CART-01';

/**
 * REST-CART-01. Doc 05 §11.
 *
 * <p>Grouped by supplier, because that is what an order actually is: the
 * restaurant sees one cart, the backend places one order per supplier, and
 * hiding that would make the acceptance screens that follow incomprehensible.
 *
 * <p><b>Nothing here computes money.</b> Each quantity change round-trips and the
 * server returns the whole procurement with every figure recalculated — which is
 * also what surfaces a price change at the moment it happens rather than at
 * checkout.
 */
export default function CartScreen() {
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { cart, loading, error, refetch } = useCart();
  const invalidate = useInvalidateCart();

  const update = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: number; quantity: string }) =>
      updateCartItem(accessToken as string, itemId, quantity),
    onSuccess: () => void invalidate(),
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not update that.', 'error'),
  });

  const remove = useMutation({
    mutationFn: (itemId: number) => removeCartItem(accessToken as string, itemId),
    onSuccess: () => void invalidate(),
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not remove that.', 'error'),
  });

  const empty = !cart || cart.supplierGroups.length === 0;

  return (
    <MandiScreen
      header={<MandiHeader title="Cart" back />}
      footer={
        empty ? undefined : (
          <MandiStickyBar>
            <View style={styles.barRow}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Total · {cart.supplierGroups.length} supplier
                {cart.supplierGroups.length === 1 ? '' : 's'}
              </MandiText>
              <MandiText variant="priceLarge">{formatMoney(cart.totalAmount)}</MandiText>
            </View>
            <MandiButton
              label="Proceed to checkout"
              size="lg"
              onPress={() => {
                track('checkout_start', { screen: SCREEN, outletId, entityId: cart.id });
                router.push(`/restaurant/checkout/${cart.id}`);
              }}
            />
          </MandiStickyBar>
        )
      }
    >
      {loading ? (
        <MandiSkeletonList count={3} />
      ) : error ? (
        <MandiErrorState message="Couldn't load your cart." onRetry={() => refetch()} />
      ) : empty ? (
        <MandiEmptyState
          icon="cart-outline"
          title="Your cart is empty"
          description="Search the catalog and compare every supplier stocking what you need."
          actionLabel="Start searching"
          onAction={() => router.push('/restaurant/search')}
        />
      ) : (
        <>
          <PriceChangeNotice
            changes={cart.priceChanges}
            onAccept={() => router.push(`/restaurant/checkout/${cart.id}`)}
          />

          {cart.supplierGroups.map((group) => (
            <MandiCard key={group.supplierStoreId}>
              {/* One card per supplier, because one card is one order. The branch
                  leads and the business follows, as everywhere else. */}
              <View style={styles.supplierRow}>
                <View style={styles.supplierName}>
                  <MandiText variant="bodyEmphasis" numberOfLines={1}>
                    {placeLabel(group.storeName, group.supplierName) ?? group.storeName}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                    {group.supplierName}
                  </MandiText>
                </View>
                <MandiText variant="priceSmall">{formatMoney(group.total, true)}</MandiText>
              </View>

              {group.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemHead}>
                    <View style={styles.itemText}>
                      <MandiText variant="bodyEmphasis" numberOfLines={2}>
                        {item.skuName}
                      </MandiText>
                      {/* "+ 5% GST" rather than "GST 5%": the price beside it is
                          the supplier's pre-tax figure while the line total below
                          includes tax, and a row holding both on unstated bases is
                          a row nobody can check. */}
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {[
                          item.brandName,
                          `${formatQuantity(item.packSize)} ${item.packUnit.toLowerCase()} pack`,
                          `${formatMoney(item.unitPrice)} + ${formatGstRate(item.gstRate)} GST`,
                        ].filter(Boolean).join(' · ')}
                      </MandiText>
                    </View>
                    <MandiIconButton
                      icon="trash-outline"
                      size="md"
                      color={Colors.textTertiary}
                      accessibilityLabel={`Remove ${item.skuName}`}
                      onPress={() => remove.mutate(item.id)}
                    />
                  </View>
                  <View style={styles.itemFoot}>
                    {/* Packs. `item.unit` is the product's base unit, and labelling
                        the count with it read "3 KG" for three 25 kg sacks. */}
                    <MandiQuantityStepper
                      value={Number(item.quantity)}
                      onChange={(quantity) =>
                        update.mutate({ itemId: item.id, quantity: String(quantity) })
                      }
                      min={1}
                      unit={Number(item.quantity) === 1 ? 'pack' : 'packs'}
                      itemLabel={item.skuName}
                    />
                    {/* Lighter than the supplier's total above it: that figure is
                        what this order is worth, this one is a line inside it. */}
                    <MandiText variant="bodyEmphasis">{formatMoney(item.lineTotal)}</MandiText>
                  </View>
                </View>
              ))}
            </MandiCard>
          ))}

          <TotalsPanel procurement={cart} />

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
            <MandiText variant="caption" color={Colors.textTertiary} style={styles.flex}>
              Prices are re-checked at checkout. You will be asked to confirm anything that moved.
            </MandiText>
          </View>
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  supplierName: { flex: 1, gap: 1 },
  item: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  itemText: { flex: 1, gap: 2 },
  itemFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  flex: { flex: 1 },
});
