import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useCartQuantity } from '@/hooks/useCartQuantity';
import { useRequestBasket } from '@/hooks/useRequestBasket';
import { useDebounced } from '@/hooks/useDebounced';
import { fetchStoreCatalog, fetchStorefrontHeader } from '@/services/catalog';
import { openThread } from '@/services/chat';
import { SkuRow } from '@/components/product/SkuRow';
import {
  SupplierStoreFacts,
  SupplierStoreTitle,
} from '@/components/restaurant/SupplierStoreHeader';
import { CART_BAR_HEIGHT, CartBar, MENU_BOTTOM_CLEARANCE } from '@/components/restaurant/CartBar';
import { FilterPills } from '@/components/common/FilterPills';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { placeLabel } from '@/utils/placeName';
import { Colors, Spacing } from '@/theme';

/**
 * One supplier's shelf, as a restaurant shops it.
 *
 * <p>Reached by tapping a supplier in search. It is the same row as everywhere
 * else — pack, price, picture, Add — with the supplier line suppressed, because
 * repeating the name on every row of a screen titled with that name is noise.
 *
 * <p><b>It shows the shelf even when the store cannot deliver here.</b> The
 * restaurant asked for this supplier by name; an empty screen would answer a
 * question they did not ask. Whether an order can actually be placed is settled at
 * checkout, by the server, which is the only place that can settle it.
 *
 * <p><b>Category tabs and a search, not one or the other.</b> The tabs answer
 * "what do they have" — a kitchen arriving from the Popular Suppliers rail came
 * because of an aisle and wants that aisle. The search answers "do they have
 * this", which is a different question and the only one that works when you
 * already know the item. The tabs are built from the rows themselves, so a
 * supplier who stocks one aisle gets one tab rather than an empty taxonomy.
 *
 * <p><b>Quantity, not Add.</b> The row's single "Add" put one pack in the cart
 * and gave no way to say four without leaving. The stepper is the product
 * screen's, through the same hook, so a shelf and a comparison count the same
 * way — and a burst of taps still lands as one write.
 */
export default function SupplierCatalogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const storeId = Number(id);
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const router = useRouter();
  const toast = useToast();
  const { drafts } = useRequestBasket();
  const { packsFor, queueChange, lineTotalFor } = useCartQuantity(drafts);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<number | null>(null);

  const settled = useDebounced(term, 250);

  /**
   * Open the conversation with this supplier. D-095.
   *
   * <p>The server owns whether there is one to open: it refuses until the two
   * have traded, and it refuses while either party's chat is switched off. Both
   * refusals are the server's own words, which is why they are shown rather
   * than replaced with something generic.
   */
  const message = useMutation({
    mutationFn: () => openThread(accessToken as string, outletId as number, storeId),
    onSuccess: (thread) => router.push(`/chat/${thread.id}`),
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not open that conversation.',
        'info',
      ),
  });

  const query = useQuery({
    queryKey: ['supplier-store', storeId, 'catalog', outletId, settled.trim()],
    queryFn: () =>
      fetchStoreCatalog(accessToken as string, storeId, outletId ?? undefined, settled.trim()),
    enabled: Number.isFinite(storeId) && accessToken != null,
  });

  /**
   * Who this supplier is, and what they have extended this kitchen.
   *
   * <p>A separate request from the catalogue, and deliberately not keyed on the
   * search term: the branch, the distance and the credit line do not change
   * because somebody typed "paneer", and refetching them on every keystroke
   * would flicker the one part of the screen that is supposed to stay still.
   */
  const head = useQuery({
    queryKey: ['supplier-store', storeId, 'storefront', outletId],
    queryFn: () => fetchStorefrontHeader(accessToken as string, storeId, outletId ?? undefined),
    enabled: Number.isFinite(storeId) && accessToken != null,
  });

  // Memoised because the categories below depend on it, and a fresh []
  // every render would rebuild the tabs on every keystroke of the search.
  const rows = useMemo(() => query.data ?? [], [query.data]);

  /**
   * The aisles this supplier actually stocks, deepest first.
   *
   * <p>Derived from the rows rather than fetched: the catalogue is already here,
   * and a second request to describe what is in front of us would be a second
   * chance to disagree with it.
   */
  const categories = useMemo(() => {
    const counts = new Map<number, { id: number; name: string; count: number }>();
    rows.forEach((sku) => {
      if (sku.categoryId == null || sku.categoryName == null) return;
      const seen = counts.get(sku.categoryId);
      if (seen == null) {
        counts.set(sku.categoryId, { id: sku.categoryId, name: sku.categoryName, count: 1 });
      } else {
        seen.count += 1;
      }
    });
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [rows]);

  const shown = category == null
    ? rows
    : rows.filter((sku) => sku.categoryId === category);

  /**
   * This supplier's basket, not the whole cart.
   *
   * <p>A shelf is one conversation: what a kitchen wants to know while filling
   * it is what they have picked *here* and what it comes to, which the whole
   * cart's totals cannot tell them. The figure is the server's — a draft
   * carries its own total, computed the way the order will.
   */
  const thisDraft = drafts.find((draft) => draft.supplierStoreId === storeId);
  const cartCount = thisDraft?.items.length ?? 0;

  // The store's identity comes off its own rows rather than a second request:
  // every row carries the supplier, and there is no catalog without one.
  const store = rows[0];
  const title = store
    ? placeLabel(store.storeName, store.supplierName) ?? store.supplierName
    : 'Supplier';

  /**
   * The screen, as a flat list so the aisles can pin.
   *
   * <p>Three bands with different jobs. The name stays because it is what a
   * kitchen is shopping; the aisles stay because they are how it navigates; and
   * everything else — distance, wait, rating, credit — is read once on arrival
   * and scrolls away, because after that it is between the reader and the
   * shelf. The indices address children by position, which is why the tab rail
   * is always rendered even when there is only one aisle.
   */
  // Pill keys are strings; 'all' leads because a kitchen that came to browse has
  // not picked an aisle yet.
  const pills = [
    { key: 'all', label: 'All', count: rows.length },
    ...categories.map((c) => ({ key: String(c.id), label: c.name, count: c.count })),
  ];
  const nodes: React.ReactNode[] = [];

  nodes.push(
    <SupplierStoreFacts
      key="facts"
      header={head.data ?? null}
      onRequestCredit={() => router.push(`/restaurant/credit/request?storeId=${storeId}`)}
      onOpenCredit={(agreementId) => router.push(`/restaurant/credit/${agreementId}`)}
    />,
  );

  const stickyIndex = nodes.length;
  nodes.push(
    /* Built from the rows, so the tabs are this supplier's aisles rather than
       the platform's taxonomy. "All" leads because a kitchen that came to
       browse has not picked one yet. Opaque and full-bleed: pinned, it has the
       catalogue passing underneath it. */
    categories.length > 1 ? (
      <View key="tabs" style={styles.tabBar}>
        <FilterPills
          items={pills}
          selected={category == null ? 'all' : String(category)}
          onSelect={(key) => setCategory(key === 'all' ? null : Number(key))}
        />
      </View>
    ) : <View key="tabs" />,
  );

  nodes.push(
    <View key="search" style={styles.gutter}>
      {/* Below the aisles: the tabs are how somebody arriving from a supplier
          tile browses, and the search is for when they already know the item.
          Outside the loading branch, because a filter that disappears while its
          own results reload is a filter you cannot use twice. */}
      <MandiSearchBar
        value={term}
        onChangeText={setTerm}
        placeholder="Search this supplier"
        loading={query.isFetching}
      />
    </View>,
  );

  nodes.push(
    <View key="body" style={styles.gutter}>
      {query.isPending ? (
        <MandiSkeletonList count={5} />
      ) : query.error ? (
        <MandiErrorState
          message="Couldn't load this supplier's catalog."
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <MandiEmptyState
          icon="basket-outline"
          title={settled.trim() ? `Nothing for "${settled.trim()}"` : 'Nothing listed yet'}
          description={
            settled.trim()
              ? 'This supplier may call it something else.'
              : 'This supplier has not listed anything for sale.'
          }
        />
      ) : (
        <View style={styles.section}>
          {store && !store.openNow && (
            <View style={styles.closed}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <MandiText variant="caption" color={Colors.textSecondary}>
                {store.opensAt
                  ? `Closed right now — opens ${store.opensAt}. You can still add to your cart.`
                  : 'Closed right now. You can still add to your cart.'}
              </MandiText>
            </View>
          )}

          {shown.map((sku) => (
            <SkuRow
              key={sku.offerId}
              sku={sku}
              hideSupplier
              // The row compares; the page decides. D-096.
              onPress={() => router.push(`/restaurant/sku/${sku.supplierSkuId}`)}
              packs={packsFor(sku.supplierSkuId)}
              lineTotal={lineTotalFor(sku.supplierSkuId)}
              onChangePacks={(packs) => queueChange(sku.supplierSkuId, packs)}
            />
          ))}
        </View>
      )}
    </View>,
  );

  return (
    <MandiScreen
      header={
        <SupplierStoreTitle
          header={head.data ?? null}
          fallbackTitle={store?.storeName ?? title}
          fallbackSubtitle={store?.supplierName}
          onSwitchStore={(branch) =>
            router.replace(`/restaurant/supplier/${branch.supplierStoreId}`)}
          onMessage={() => message.mutate()}
        />
      }
      footer={
        <CartBar
          count={cartCount}
          total={thisDraft?.agreedTotal}
          disableWhenEmpty
          cartElsewhere={drafts.some((draft) => draft.items.length > 0)}
          onPress={() => router.push('/restaurant/cart')}
        />
      }
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      stickyIndices={[stickyIndex]}
      // The gutter moves onto the bands, so the pinned aisle bar can reach both
      // edges. Inset, it would leave two strips of catalogue scrolling past it.
      contentStyle={styles.content}
    >
      {nodes}
    </MandiScreen>
  );
}

/** Branch and distance, when there is a branch or a distance to give. */

const styles = StyleSheet.create({
  // The bar's height plus room for anything floating over the list, so the last
  // row's stepper is never under either.
  content: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: CART_BAR_HEIGHT + MENU_BOTTOM_CLEARANCE,
    gap: 0,
  },
  gutter: { paddingHorizontal: Spacing.screenHorizontal },
  section: { gap: 0 },
  tabBar: {
    // Opaque and edge to edge, because the catalogue scrolls under it.
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    marginBottom: Spacing.md,
  },
  closed: {
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Spacing.sm,
  },
});
