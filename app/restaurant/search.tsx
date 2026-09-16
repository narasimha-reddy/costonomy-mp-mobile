import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { searchProducts, searchSkus, searchSuppliers } from '@/services/catalog';
import { useDebounced } from '@/hooks/useDebounced';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { useAddToCart } from '@/hooks/useAddToCart';
import { ProductCard } from '@/components/product/ProductCard';
import { SkuRow } from '@/components/product/SkuRow';
import { SupplierRow } from '@/components/product/SupplierRow';
import type { SupplierSearchPage } from '@/models/discovery';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { track } from '@/analytics';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'REST-SEARCH-02';
const MIN_TERM = 2;

/** The default distance for the supplier directory, in kilometres. */
const NEARBY_KM = 10;

type Tab = 'products' | 'skus' | 'suppliers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'skus', label: 'Packs' },
  { key: 'suppliers', label: 'Suppliers' },
];

/**
 * REST-SEARCH-02. Doc 05 §6.
 *
 * <p><b>Three questions, three tabs.</b> "What is curd" (one row per canonical
 * product, every supplier collapsed into a "from ₹X"), "what curd can I buy right
 * now" (one row per supplier's pack, with its own price and picture), and "who
 * can deliver to me at all". The first is the comparison the marketplace exists
 * for; the second is how a kitchen that already knows the brand shops; the third
 * is how a new restaurant finds out who is out there.
 *
 * <p>The Suppliers tab works with an empty box, and the others do not. Suppliers
 * is a directory — the answer to "who is near me" does not need a search term —
 * whereas a list of every SKU in the catalog is not an answer to anything.
 *
 * <p>The field updates on every keystroke; the request waits for a pause. A
 * request per character would be both slower and, on the search rate limit, a way
 * to throttle someone for typing.
 */
export default function SearchScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<Tab>('products');
  const [radiusKm, setRadiusKm] = useState<number | undefined>(NEARBY_KM);
  const { recent, remember, clear } = useRecentSearches();
  const addToCart = useAddToCart();

  const settled = useDebounced(term, 250);
  const query = settled.trim();
  const searching = query.length >= MIN_TERM;

  const products = useQuery({
    queryKey: ['search', 'products', query],
    queryFn: ({ signal }) => searchProducts(accessToken as string, query, signal),
    enabled: tab === 'products' && searching && accessToken != null,
  });

  const skus = useQuery({
    queryKey: ['search', 'skus', query, outletId],
    queryFn: ({ signal }) => searchSkus(accessToken as string, query, outletId ?? undefined, signal),
    enabled: tab === 'skus' && searching && accessToken != null,
  });

  const suppliers = useQuery({
    queryKey: ['search', 'suppliers', query, outletId, radiusKm],
    queryFn: ({ signal }) =>
      searchSuppliers(accessToken as string, query, outletId ?? undefined, radiusKm, signal),
    enabled: tab === 'suppliers' && accessToken != null,
  });

  function openProduct(productId: number) {
    if (searching) remember(query);
    track('open_product', { screen: SCREEN, outletId, entityId: productId });
    router.push(`/restaurant/product/${productId}`);
  }

  function openSupplier(storeId: number) {
    if (searching) remember(query);
    track('open_supplier', { screen: SCREEN, outletId, entityId: storeId });
    router.push(`/restaurant/supplier/${storeId}`);
  }

  // Tapping a pack asks "who else sells this, and for how much" — so it lands on
  // the canonical comparison, the same place a product row goes.
  function openSkuComparison(canonicalProductId: number) {
    openProduct(canonicalProductId);
  }

  const idle = !searching && tab !== 'suppliers';

  return (
    <MandiScreen
      header={
        <Header
          term={term}
          onTerm={setTerm}
          tab={tab}
          onTab={setTab}
          loading={products.isFetching || skus.isFetching || suppliers.isFetching}
        />
      }
    >
      {idle ? (
        <RecentSearches recent={recent} onPick={setTerm} onClear={clear} />
      ) : tab === 'products' ? (
        <Results
          query={products}
          empty={`Nothing for "${query}"`}
          hint="Try a shorter word, or the name your supplier uses."
          render={(list) =>
            list.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                variant="row"
                onPress={() => openProduct(product.id)}
              />
            ))
          }
        />
      ) : tab === 'skus' ? (
        <Results
          query={skus}
          empty={`No packs for "${query}"`}
          hint="No supplier who delivers here is listing this right now."
          render={(list) =>
            list.map((sku) => (
              <SkuRow
                key={sku.offerId}
                sku={sku}
                onPress={() => openSkuComparison(sku.canonicalProductId)}
                onAdd={() => addToCart.mutate(sku.offerId)}
                adding={addToCart.isPending && addToCart.variables === sku.offerId}
              />
            ))
          }
        />
      ) : (
        <Suppliers
          query={suppliers}
          searching={searching}
          term={query}
          radiusKm={radiusKm}
          onWiden={() => setRadiusKm(undefined)}
          onOpen={openSupplier}
        />
      )}
    </MandiScreen>
  );
}

/**
 * The four states every list here shares. §23A: loading, error + retry, empty,
 * results — no screen gets to skip one.
 */
function Results<T>({
  query,
  empty,
  hint,
  render,
}: {
  query: { isPending: boolean; error: unknown; data?: T[]; refetch: () => unknown };
  empty: string;
  hint: string;
  render: (list: T[]) => React.ReactNode;
}) {
  if (query.isPending) return <MandiSkeletonList count={5} />;
  if (query.error) {
    return <MandiErrorState message="Search didn't work." onRetry={() => query.refetch()} />;
  }
  const list = query.data ?? [];
  if (list.length === 0) {
    return <MandiEmptyState icon="search-outline" title={empty} description={hint} />;
  }
  return <>{render(list)}</>;
}

function Suppliers({
  query,
  searching,
  term,
  radiusKm,
  onWiden,
  onOpen,
}: {
  query: UseQueryResult<SupplierSearchPage>;
  searching: boolean;
  term: string;
  radiusKm: number | undefined;
  onWiden: () => void;
  onOpen: (storeId: number) => void;
}) {
  if (query.isPending) return <MandiSkeletonList count={4} />;
  if (query.error) {
    return <MandiErrorState message="Couldn't load suppliers." onRetry={() => query.refetch()} />;
  }

  const page = query.data;
  const list = page?.suppliers ?? [];
  const beyond = page?.beyondRadius ?? 0;

  if (list.length === 0) {
    return (
      <View style={styles.section}>
        <MandiEmptyState
          icon="storefront-outline"
          title={searching ? `No supplier matching "${term}"` : 'No supplier delivers here yet'}
          description={
            searching
              ? 'Try the business name rather than the branch.'
              : 'Suppliers appear here once one covers this outlet.'
          }
        />
        {beyond > 0 && <WidenRow count={beyond} onWiden={onWiden} />}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title={searching ? 'Matching suppliers' : `Within ${radiusKm ?? '—'} km`}
        count={list.length}
      />
      {list.map((supplier) => (
        <SupplierRow
          key={supplier.supplierStoreId}
          supplier={supplier}
          onPress={() => onOpen(supplier.supplierStoreId)}
        />
      ))}
      {/* Nothing serviceable is hidden — it is one tap away and says how many. */}
      {beyond > 0 && <WidenRow count={beyond} onWiden={onWiden} />}
    </View>
  );
}

function WidenRow({ count, onWiden }: { count: number; onWiden: () => void }) {
  return (
    <Pressable
      onPress={onWiden}
      accessibilityRole="button"
      accessibilityLabel={`Show ${count} more suppliers that deliver here`}
      style={styles.widen}
    >
      <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
      <MandiText variant="captionEmphasis" color={Colors.primary}>
        {count} more deliver here — show them
      </MandiText>
    </Pressable>
  );
}

function RecentSearches({
  recent,
  onPick,
  onClear,
}: {
  recent: string[];
  onPick: (term: string) => void;
  onClear: () => void;
}) {
  if (recent.length === 0) {
    return (
      <MandiEmptyState
        icon="search-outline"
        title="What do you need?"
        description="Search the catalog and compare every supplier stocking it."
      />
    );
  }

  return (
    <View style={styles.section}>
      <MandiSectionHeader title="Recent" actionLabel="Clear" onAction={onClear} />
      {recent.map((item) => (
        <Pressable
          key={item}
          onPress={() => onPick(item)}
          accessibilityRole="button"
          style={styles.recentRow}
        >
          <Ionicons name="time-outline" size={16} color={Colors.textTertiary} />
          <MandiText variant="body">{item}</MandiText>
        </Pressable>
      ))}
    </View>
  );
}

function Header({
  term,
  onTerm,
  tab,
  onTab,
  loading,
}: {
  term: string;
  onTerm: (term: string) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  loading: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <MandiSearchBar
          value={term}
          onChangeText={onTerm}
          placeholder="Search paneer, rice, oil…"
          autoFocus
          loading={loading}
          style={styles.field}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((option) => {
          const active = option.key === tab;
          return (
            <Pressable
              key={option.key}
              onPress={() => onTab(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <MandiText
                variant="captionEmphasis"
                color={active ? Colors.textInverse : Colors.textSecondary}
              >
                {option.label}
              </MandiText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: Spacing.sm, gap: Spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
  },
  back: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { flex: 1 },
  tabs: { paddingHorizontal: Spacing.screenHorizontal, gap: Spacing.sm },
  tab: {
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  tabActive: { backgroundColor: Colors.primary },
  section: { gap: Spacing.sm },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
  },
  widen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
  },
});
