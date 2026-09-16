import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
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
  MandiIconButton,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiStatusChip,
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
    >
      <View style={styles.toolbar}>
        <MandiSearchBar
          value={term}
          onChangeText={setTerm}
          placeholder="Find a product"
          style={styles.flex}
        />
        <MandiIconButton
          icon="add"
          accessibilityLabel="List a new product"
          background={Colors.primary}
          color={Colors.textInverse}
          onPress={() => router.push('/supplier/catalog/new')}
        />
      </View>

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
        <View style={styles.row}>
          <View style={styles.text}>
            <MandiText variant="bodyEmphasis">{sku.name}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {sku.canonicalProductName} · {formatQuantity(sku.packSize)} {sku.packUnit}
              {sku.skuCode ? ` · ${sku.skuCode}` : ''}
            </MandiText>
          </View>
          <MandiStatusChip
            label={!active ? 'Delisted' : available ? 'Available' : 'Out of stock'}
            tone={!active ? 'neutral' : available ? 'success' : 'warning'}
            size="sm"
          />
        </View>

        <View style={styles.row}>
          <MandiText variant="price">{formatMoney(sku.sellingPrice)}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            GST {formatGstRate(sku.gstRate)}
          </MandiText>
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
          <View style={styles.editorRow}>
            <MandiButton
              label="Save price"
              size="md"
              loading={save.isPending}
              onPress={() => save.mutate({ sellingPrice: price })}
              style={styles.flex}
            />
            <MandiButton label="Cancel" variant="tertiary" size="md" onPress={onDone} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <MandiButton label="Quick price" variant="secondary" size="md" onPress={onEdit} style={styles.flex} />
          <MandiButton
            label={available ? 'Mark out of stock' : 'Mark available'}
            variant="tertiary"
            size="md"
            loading={save.isPending}
            onPress={() => save.mutate({ availability: available ? 'OUT_OF_STOCK' : 'AVAILABLE' })}
            style={styles.flex}
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
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summary: { gap: Spacing.sm },
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
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  editor: { gap: Spacing.sm, marginTop: Spacing.sm },
  editorRow: { flexDirection: 'row', gap: Spacing.sm },
});
