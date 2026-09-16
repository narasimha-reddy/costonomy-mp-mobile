import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSkus, updateSku, type SupplierSku } from '@/services/supplier';
import { fetchCategories } from '@/services/catalog';
import { CategoryTabs } from '@/components/product/CategoryTabs';
import type { Category } from '@/models/catalog';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiFab,
  MandiFilterMenu,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiText,
  useToast,
  type FilterOption,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatPack } from '@/utils/money';
import { track } from '@/analytics';
import { ProductThumb } from '@/components/product/ProductThumb';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'SUP-CATALOG-01';

type Filter = 'all' | 'available' | 'out_of_stock' | 'inactive';

const STATUS_FILTERS: FilterOption<Filter>[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'out_of_stock', label: 'Out of stock' },
  { key: 'inactive', label: 'Delisted' },
];

/**
 * SUP-CATALOG-01 and -02. Doc 05 §29.
 *
 * <p>Editing happens inline. A supplier marking something out of stock is doing
 * it while a restaurant is ordering it, and a screen transition in the way is how
 * a listing stays wrong for another hour.
 *
 * <p><b>A price change supersedes the offer rather than editing it.</b> That is
 * the backend's behaviour and the reason this screen never shows a price as
 * retroactive: orders already placed keep the price they were placed at.
 */
export default function SupplierCatalogScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  const query = useQuery({
    queryKey: ['store', storeId, 'skus'],
    queryFn: () => fetchSkus(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  /** The category tab narrows first; status and text narrow what is left. */
  const inCategory = useMemo(
    () => (query.data ?? []).filter(
      (sku) => categoryId == null || sku.categoryId === categoryId,
    ),
    [query.data, categoryId],
  );

  const skus = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const matching = needle
      ? inCategory.filter((sku) =>
          `${sku.name} ${sku.canonicalProductName} ${sku.skuCode ?? ''}`
            .toLowerCase()
            .includes(needle))
      : inCategory;

    switch (filter) {
      case 'available':
        return matching.filter((s) => s.status === 'ACTIVE' && s.availability === 'AVAILABLE');
      case 'out_of_stock':
        return matching.filter((s) => s.status === 'ACTIVE' && s.availability !== 'AVAILABLE');
      case 'inactive':
        return matching.filter((s) => s.status !== 'ACTIVE');
      default:
        return matching;
    }
  }, [inCategory, filter, term]);

  /** Counts on the tabs, so an empty category is visible before it is opened. */
  const counts = useMemo(() => {
    const map = new Map<number | null, number>();
    const all = query.data ?? [];
    map.set(null, all.length);
    all.forEach((sku) => {
      if (sku.categoryId == null) return;
      map.set(sku.categoryId, (map.get(sku.categoryId) ?? 0) + 1);
    });
    return map;
  }, [query.data]);

  /** Categories this store actually lists in — an empty tab helps nobody. */
  const stocked = useMemo(
    () => (categories.data ?? []).filter((c: Category) => (counts.get(c.id) ?? 0) > 0),
    [categories.data, counts],
  );

  return (
    <MandiScreen
      header={(
        <Header
          categories={stocked}
          categoryId={categoryId}
          onCategory={setCategoryId}
          counts={counts}
        />
      )}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      floating={(
        /* Floating rather than in the toolbar: a toolbar button is reachable
           when the catalog is empty and buried once it is not, which is the
           wrong way round. */
        <MandiFab
          accessibilityLabel="List a new product"
          onPress={() => router.push('/supplier/catalog/new')}
        />
      )}
    >
      <View style={styles.toolbar}>
        <MandiSearchBar
          value={term}
          onChangeText={setTerm}
          placeholder="Find a product"
          style={styles.flex}
        />
        <MandiFilterMenu
          options={STATUS_FILTERS}
          selected={filter}
          onSelect={setFilter}
          title="Show"
        />
      </View>

      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load your catalog." onRetry={() => query.refetch()} />
      ) : skus.length === 0 ? (
        // Three different nothings, and only one of them means "add a product".
        // Told "your catalog is empty" while holding twenty-four listings, a
        // supplier's first thought is that they have lost them.
        (() => {
          const narrowed = term !== '' || filter !== 'all' || categoryId != null;
          const filterLabel = STATUS_FILTERS.find((f) => f.key === filter)?.label;
          return (
            <MandiEmptyState
              icon="pricetags-outline"
              title={
                term ? `Nothing matching "${term}"`
                  : narrowed ? `Nothing ${(filterLabel ?? '').toLowerCase() || 'here'}`
                  : 'Your catalog is empty'
              }
              description={
                term ? 'Try the product name a restaurant would search for.'
                  : narrowed ? 'Nothing in your catalog matches this filter. Widen it to see the rest.'
                  : 'Restaurants can only order what you list here. Add your first product — it takes about a minute.'
              }
              actionLabel={narrowed ? undefined : 'List a product'}
              onAction={narrowed ? undefined : () => router.push('/supplier/catalog/new')}
            />
          );
        })()
      ) : (
        skus.map((sku) => (
          <SkuCard
            key={sku.id}
            sku={sku}
            editing={editing === sku.id}
            onEdit={() => setEditing(editing === sku.id ? null : sku.id)}
            onDone={() => setEditing(null)}
            onOpen={() => router.push(`/supplier/catalog/${sku.id}`)}
            storeId={storeId}
          />
        ))
      )}

    </MandiScreen>
  );
}

function SkuCard({
  sku,
  editing,
  onEdit,
  onDone,
  onOpen,
  storeId,
}: {
  sku: SupplierSku;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onOpen: () => void;
  storeId: number | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const [price, setPrice] = useState(String(sku.sellingPrice));

  const available = sku.availability === 'AVAILABLE';
  const active = sku.status === 'ACTIVE';
  // Three states, three readings. Out of stock is a fact about today, not a
  // fault, so it is amber rather than red — red is kept for money and refusals.
  //
  // **Available is not coloured.** Nearly every row in a catalog is available, and
  // colouring all of them makes the one row that is not look like the rest. The
  // tone is reserved for the states worth noticing.
  const stateTone = !active
    ? { label: 'Delisted', tint: Colors.textSecondary, background: Colors.surfaceSunken, icon: 'eye-off-outline' as const }
    : available
      ? { label: 'Available', tint: Colors.textSecondary, background: Colors.successLight, icon: 'checkmark-circle' as const }
      : { label: 'Out of stock', tint: Colors.warning, background: Colors.warningLight, icon: 'alert-circle' as const };

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateSku>[2]) =>
      updateSku(accessToken as string, sku.id, patch),
    onSuccess: (_data, patch) => {
      track('sku_updated', { screen: SCREEN, entityId: sku.id }, { fields: Object.keys(patch) });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'skus'] });
      onDone();
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  return (
    <MandiCard>
      {/* Only the description opens the editor. Wrapping the whole card — action
          buttons included — nests a button inside a button: invalid on web, and
          two overlapping press targets on a device. */}
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${sku.name}`}
        style={styles.summary}
      >
        {/* Two columns: what it is on the left, what it costs on the right.
            Stacked, the price sat on a line of its own under a full-width name
            and the availability chip floated opposite nothing — three bands for
            four short facts. Side by side the eye runs down one column of names
            and one of prices, which is how a catalog is read. */}
        <View style={styles.identity}>
          {/* The supplier's own pack where they have photographed it, the
              platform's product where they have not. This is the listing as it
              exists, and a supplier looking at their catalog should see the
              picture a restaurant will see. */}
          <ProductThumb uri={sku.imageUrl || sku.canonicalProductImageUrl} size={40} />

          <View style={styles.text}>
            <MandiText variant="bodyEmphasis" numberOfLines={1}>{sku.name}</MandiText>
            {/* The canonical product first: a supplier naming a SKU "BTR-1KG"
                still needs to see that it is Butter, and that name is what a
                restaurant searches by. Availability joins this line rather than
                keeping a chip of its own — for a catalog that is almost entirely
                available, a badge on every row is a badge that says nothing, and
                the one that matters is the one that reads "Out of stock". */}
            <View style={styles.metaRow}>
              <MandiText
                variant="caption"
                color={Colors.textSecondary}
                numberOfLines={1}
                style={styles.flex}
              >
                {[
                  sku.canonicalProductName !== sku.name ? sku.canonicalProductName : null,
                  formatPack(sku.packSize, sku.packUnit, sku.measureValue, sku.measureUnit),
                  sku.brandName,
                ].filter(Boolean).join(' · ')}
                {' · '}
                <MandiText variant="caption" color={stateTone.tint}>{stateTone.label}</MandiText>
              </MandiText>
            </View>
          </View>

          <View style={styles.money}>
            <MandiText variant="priceSmall">{formatMoney(sku.sellingPrice)}</MandiText>
            <MandiText variant="caption" color={Colors.textTertiary}>
              GST {formatGstRate(sku.gstRate)}
            </MandiText>
          </View>
        </View>
      </Pressable>

      {editing ? (
        <View style={styles.editor}>
          <MandiFormField
            label="Selling price"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            hint="Applies to new orders only. Orders already placed keep their price."
          />
          <View style={styles.actions}>
            <MandiButton
              label="Save"
              size="sm"
              loading={save.isPending}
              onPress={() => save.mutate({ sellingPrice: price })}
              style={styles.flex}
            />
            <MandiButton
              label="Cancel"
              variant="neutral"
              size="sm"
              onPress={onDone}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        // The chevron sits with the actions rather than beside the name: it is
        // the third thing you can do to this row, and on its own line it cost the
        // card a whole band to say "there is more".
        <View style={styles.actions}>
          <MandiButton
            label="Change price"
            variant="neutral"
            size="sm"
            icon="pricetag-outline"
            onPress={onEdit}
            fullWidth={false}
          />
          <MandiButton
            // "Out of stock" is also a filter tab on this screen. A label that
            // reads as a state next to one that reads as a filter is ambiguous;
            // an action should say what it does.
            label={available ? 'Mark out of stock' : 'Mark in stock'}
            variant="neutral"
            size="sm"
            icon={available ? 'close-circle-outline' : 'checkmark-circle-outline'}
            loading={save.isPending}
            onPress={() => save.mutate({ availability: available ? 'OUT_OF_STOCK' : 'AVAILABLE' })}
            fullWidth={false}
          />
          <View style={styles.spacer} />
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${sku.name}`}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>
      )}
    </MandiCard>
  );
}

function Header({
  categories,
  categoryId,
  onCategory,
  counts,
}: {
  categories: Category[];
  categoryId: number | null;
  onCategory: (id: number | null) => void;
  counts: Map<number | null, number>;
}) {
  return (
    <View style={styles.header}>
      <SupplierHeader subtitle="Catalog" />
      {categories.length > 0 && (
        <CategoryTabs
          categories={categories}
          selected={categoryId}
          onSelect={onCategory}
          counts={counts}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summary: { gap: 0 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  money: { alignItems: 'flex-end', gap: 1 },
  spacer: { flex: 1 },
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  editor: { gap: Spacing.sm, marginTop: Spacing.md },
  tabs: { paddingHorizontal: Spacing.screenHorizontal, gap: Spacing.sm },
  tab: {
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  tabActive: { backgroundColor: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  text: { flex: 1, gap: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
