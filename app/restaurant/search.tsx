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
    enabled: tab === 'suppliers' && searching && accessToken != null,
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

  // Below two characters there is nothing to search and nothing to slice three
  // ways, so the screen is its zero state: the tabs are not yet a question.
  const idle = !searching;

  return (
    <MandiScreen
      header={
        <Header
          term={term}
          onTerm={setTerm}
          tab={tab}
          onTab={setTab}
          loading={products.isFetching || skus.isFetching || suppliers.isFetching}
          showTabs={searching}
        />
      }
    >
      {idle ? (
        <ZeroState recent={recent} onPick={setTerm} onClear={clear} />
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
          term={query}
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

/**
 * Suppliers matching the term — those stocking it, and those named it.
 *
 * <p>Only reached with a term, because the tabs only exist once there is one.
 * The endpoint still answers with an empty term, which is the "who delivers here
 * at all" directory; nothing surfaces that today.
 */
function Suppliers({
  query,
  term,
  onWiden,
  onOpen,
}: {
  query: UseQueryResult<SupplierSearchPage>;
  term: string;
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
          title={`No supplier has "${term}"`}
          description="Nobody delivering here stocks it, under that name or any other they use for it."
        />
        {beyond > 0 && <WidenRow count={beyond} onWiden={onWiden} />}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <MandiSectionHeader title="Matching suppliers" count={list.length} />
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

/**
 * The screen before anything has been typed.
 *
 * <p>Recent searches are chips rather than rows: they are one or two words each,
 * and a full-width row per word wastes the space that a wrapped set of chips
 * fills — six terms fit where three rows did, which is the difference between
 * seeing your history and scrolling it.
 *
 * <p>Deliberately no thumbnails, unlike the consumer apps this borrows from. A
 * picture beside "curd" would be one supplier's curd standing for the search, and
 * we would be picking which — on a marketplace whose whole point is that the
 * choice is the restaurant's.
 */
function ZeroState({
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
      <MandiSectionHeader
        title="Recent searches"
        actionLabel="Clear"
        onAction={onClear}
        inlineAction
      />
      <View style={styles.chips}>
        {recent.map((item) => (
          <Pressable
            key={item}
            onPress={() => onPick(item)}
            accessibilityRole="button"
            accessibilityLabel={`Search ${item}`}
            style={styles.chip}
          >
            <Ionicons name="time-outline" size={14} color={Colors.textTertiary} />
            <MandiText variant="body" numberOfLines={1}>{item}</MandiText>
          </Pressable>
        ))}
      </View>

      {/* Top picks for you goes here — a feed built from what this outlet has
          searched and ordered before. Left out rather than stubbed: a heading
          with nothing under it is worse than no heading. */}
    </View>
  );
}

function Header({
  term,
  onTerm,
  tab,
  onTab,
  loading,
  showTabs,
}: {
  term: string;
  onTerm: (term: string) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  loading: boolean;
  /** Hidden until there is something to slice three ways. */
  showTabs: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <MandiSearchBar
          value={term}
          onChangeText={onTerm}
          placeholder="Search for paneer, rice, oil and more"
          autoFocus
          pill
          loading={loading}
          style={styles.field}
          leading={
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
            </Pressable>
          }
        />
      </View>

      {showTabs && (
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
      )}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    minHeight: TouchTarget.min - 8,
    maxWidth: '100%',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  widen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
  },
});
