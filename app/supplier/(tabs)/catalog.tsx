import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSkus, updateSku, type SupplierSku } from '@/services/supplier';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiFab,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'SUP-CATALOG-01';

type Filter = 'all' | 'available' | 'out_of_stock' | 'inactive';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'out_of_stock', label: 'Out of stock' },
  { key: 'inactive', label: 'Inactive' },
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
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['store', storeId, 'skus'],
    queryFn: () => fetchSkus(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  const skus = useMemo(() => {
    const all = query.data ?? [];
    const matching = term.trim()
      ? all.filter((sku) =>
          `${sku.name} ${sku.canonicalProductName} ${sku.skuCode ?? ''}`
            .toLowerCase()
            .includes(term.trim().toLowerCase()))
      : all;

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
  }, [query.data, filter, term]);

  return (
    <MandiScreen
      header={<Header filter={filter} onFilter={setFilter} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      floating={(
        /* Floating rather than in the toolbar: a toolbar button is reachable
           when the catalog is empty and buried once it is not, which is the
           wrong way round. */
        <MandiFab
          accessibilityLabel="List a new product"
          label="Add"
          onPress={() => router.push('/supplier/catalog/new')}
        />
      )}
    >
      <MandiSearchBar value={term} onChangeText={setTerm} placeholder="Find a product" />

      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load your catalog." onRetry={() => query.refetch()} />
      ) : skus.length === 0 ? (
        <MandiEmptyState
          icon="pricetags-outline"
          title={term ? `Nothing matching "${term}"` : 'Your catalog is empty'}
          description={term
            ? 'Try the product name a restaurant would search for.'
            : 'Restaurants can only order what you list here. Add your first product — it takes about a minute.'}
          actionLabel={term ? undefined : 'List a product'}
          onAction={term ? undefined : () => router.push('/supplier/catalog/new')}
        />
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
  const stateTone = !active
    ? { label: 'Delisted', tint: Colors.textSecondary, background: Colors.surfaceSunken, icon: 'eye-off-outline' as const }
    : available
      ? { label: 'Available', tint: Colors.success, background: Colors.successLight, icon: 'checkmark-circle' as const }
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
        <View style={styles.identity}>
          <View style={styles.text}>
            <MandiText variant="bodyEmphasis" numberOfLines={1}>{sku.name}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {formatQuantity(sku.packSize)} {sku.packUnit}
              {sku.brandName ? ` · ${sku.brandName}` : ''}
              {sku.skuCode ? ` · ${sku.skuCode}` : ''}
            </MandiText>
          </View>

          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </View>

        <View style={styles.priceRow}>
          <MandiText variant="price">{formatMoney(sku.sellingPrice)}</MandiText>
          <MandiText variant="caption" color={Colors.textTertiary}>
            GST {formatGstRate(sku.gstRate)}
          </MandiText>
          <View style={styles.spacer} />
          <View style={[styles.state, { backgroundColor: stateTone.background }]}>
            <Ionicons name={stateTone.icon} size={12} color={stateTone.tint} />
            <MandiText variant="caption" color={stateTone.tint}>{stateTone.label}</MandiText>
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
        </View>
      )}
    </MandiCard>
  );
}

function Header({ filter, onFilter }: { filter: Filter; onFilter: (filter: Filter) => void }) {
  return (
    <View style={styles.header}>
      <SupplierHeader subtitle="Catalog" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {FILTERS.map((option) => {
          const active = option.key === filter;
          return (
            <Pressable
              key={option.key}
              onPress={() => onFilter(option.key)}
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
  flex: { flex: 1 },
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  summary: { gap: Spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
  text: { flex: 1, gap: Spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
});
