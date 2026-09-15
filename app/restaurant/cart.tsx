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
              <View>
                <MandiText variant="caption" color={Colors.textSecondary}>Total</MandiText>
                <MandiText variant="priceLarge">{formatMoney(cart.totalAmount)}</MandiText>
              </View>
              <MandiText variant="caption" color={Colors.textTertiary}>
                {cart.supplierGroups.length} supplier
                {cart.supplierGroups.length === 1 ? '' : 's'}
              </MandiText>
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
              <View style={styles.supplierRow}>
                <Ionicons name="storefront-outline" size={16} color={Colors.textSecondary} />
                <MandiText variant="bodyEmphasis" style={styles.supplierName}>
                  {group.supplierName}
                </MandiText>
                <MandiText variant="priceSmall">{formatMoney(group.total, true)}</MandiText>
              </View>

              {group.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemHead}>
                    <View style={styles.itemText}>
                      <MandiText variant="body">{item.productName}</MandiText>
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {formatQuantity(item.packSize)} {item.packUnit} ·{' '}
                        {formatMoney(item.unitPrice)} · GST {formatGstRate(item.gstRate)}
                      </MandiText>
                    </View>
                    <MandiIconButton
                      icon="trash-outline"
                      accessibilityLabel={`Remove ${item.productName}`}
                      onPress={() => remove.mutate(item.id)}
                    />
                  </View>
                  <View style={styles.itemFoot}>
                    <MandiQuantityStepper
                      value={Number(item.quantity)}
                      onChange={(quantity) =>
                        update.mutate({ itemId: item.id, quantity: String(quantity) })
                      }
                      min={1}
                      unit={item.unit}
                    />
                    <MandiText variant="bodyEmphasis">{formatMoney(item.lineTotal)}</MandiText>
                  </View>
                </View>
              ))}
            </MandiCard>
          ))}

          <TotalsPanel procurement={cart} />

          <MandiText variant="caption" color={Colors.textTertiary}>
            Prices are re-checked at checkout. You will be asked to confirm anything that moved.
          </MandiText>
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  supplierName: { flex: 1 },
  item: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  itemText: { flex: 1, gap: Spacing.xs },
  itemFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
});
