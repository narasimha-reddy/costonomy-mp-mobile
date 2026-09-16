import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchPriceHistory, fetchSkus, updateSku } from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { ProductThumb } from '@/components/product/ProductThumb';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-CATALOG-02';
const GST_RATES = ['0', '5', '12', '18'];

/**
 * SUP-CATALOG-02, the full editor. Doc 05 §29.
 *
 * <p><b>A price change supersedes the offer; it does not rewrite history.</b>
 * That is the backend's behaviour, and the reason the price history sits on this
 * screen: orders already placed keep the price they were placed at, and a
 * supplier who cannot see that will assume a change is retroactive and price
 * defensively.
 *
 * <p>Delisting is offered instead of deleting, because every order that ever
 * included this SKU still references it.
 */
export default function SkuEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const skuId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const list = useQuery({
    queryKey: ['store', storeId, 'skus'],
    queryFn: () => fetchSkus(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  const history = useQuery({
    queryKey: ['sku', skuId, 'price-history'],
    queryFn: () => fetchPriceHistory(accessToken as string, skuId),
    enabled: Number.isFinite(skuId) && accessToken != null,
  });

  const sku = (list.data ?? []).find((item) => item.id === skuId);

  const [name, setName] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [sellingPrice, setSellingPrice] = useState<string | null>(null);
  const [gstRate, setGstRate] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Seeded from the server the first time it arrives, edited locally after.
  const nameValue = name ?? sku?.name ?? '';
  const brandValue = brandName ?? sku?.brandName ?? '';
  const priceValue = sellingPrice ?? (sku ? String(sku.sellingPrice) : '');
  const gstValue = gstRate ?? (sku ? String(Number(sku.gstRate)) : '5');
  const imageValue = imageUrl ?? sku?.imageUrl ?? '';

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateSku>[2]) =>
      updateSku(accessToken as string, skuId, patch),
    onSuccess: (_data, patch) => {
      track('sku_updated', { screen: SCREEN, entityId: skuId }, { fields: Object.keys(patch) });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'skus'] });
      void queryClient.invalidateQueries({ queryKey: ['sku', skuId, 'price-history'] });
      toast.show('Saved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  const priceChanged = sku != null && Number(priceValue) !== Number(sku.sellingPrice);
  const gstChanged = sku != null && Number(gstValue) !== Number(sku.gstRate);
  const detailsChanged = sku != null
    && (nameValue.trim() !== sku.name
      || brandValue.trim() !== (sku.brandName ?? '')
      || imageValue.trim() !== (sku.imageUrl ?? ''));
  const dirty = priceChanged || gstChanged || detailsChanged;

  return (
    <MandiScreen
      header={<MandiHeader title={sku?.name ?? 'Product'} subtitle={sku?.canonicalProductName} back />}
      footer={
        dirty ? (
          <MandiStickyBar>
            {priceChanged && (
              <MandiText variant="caption" color={Colors.textSecondary} center>
                A new price applies to new orders only. Orders already placed keep theirs.
              </MandiText>
            )}
            <MandiButton
              label="Save changes"
              size="lg"
              loading={save.isPending}
              onPress={() => save.mutate({
                name: nameValue.trim(),
                brandName: brandValue.trim(),
                // Empty string, not undefined: the update applies any non-null
                // field, so "" is how a supplier takes their own photo back down
                // and returns the listing to the catalog picture.
                imageUrl: imageValue.trim(),
                sellingPrice: priceValue,
                gstRate: gstValue,
              })}
            />
          </MandiStickyBar>
        ) : undefined
      }
    >
      {list.isPending ? (
        <MandiSkeletonList count={3} />
      ) : sku == null ? (
        <MandiErrorState
          title="Not found"
          message="This product is not listed in the selected store."
          onRetry={() => list.refetch()}
        />
      ) : (
        <>
          {/* The platform product this listing maps onto, with the platform's
              picture. Everything below is the supplier's own — and the two must
              not be conflated, because it is the canonical product that puts
              this listing into a restaurant's comparison (doc 01 §7). */}
          <MandiCard>
            <View style={styles.identity}>
              <ProductThumb uri={sku.canonicalProductImageUrl} size={44} />
              <View style={styles.flex}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Listed against
                </MandiText>
                <MandiText variant="bodyEmphasis" numberOfLines={1}>
                  {sku.canonicalProductName}
                </MandiText>
              </View>
            </View>
          </MandiCard>

          <MandiCard>
            <View style={styles.row}>
              {/* The supplier's own pack picture, beside their own price — or
                  the canonical one standing in until they add theirs. */}
              <ProductThumb
                uri={sku.imageUrl || sku.canonicalProductImageUrl}
                size={56}
              />
              <View style={styles.flex}>
                <MandiText variant="caption" color={Colors.textSecondary}>Currently</MandiText>
                <MandiText variant="priceLarge">{formatMoney(sku.sellingPrice)}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  per {formatQuantity(sku.packSize)} {sku.packUnit} · GST {formatGstRate(sku.gstRate)}
                </MandiText>
              </View>
              <MandiStatusChip
                label={sku.status !== 'ACTIVE' ? 'Delisted'
                  : sku.availability === 'AVAILABLE' ? 'Available' : 'Out of stock'}
                tone={sku.status !== 'ACTIVE' ? 'neutral'
                  : sku.availability === 'AVAILABLE' ? 'success' : 'warning'}
                size="sm"
              />
            </View>
          </MandiCard>

          <MandiFormField label="Product name" value={nameValue} onChangeText={setName} required />
          <MandiFormField
            label="Brand (optional)"
            value={brandValue}
            onChangeText={setBrandName}
            placeholder="Amul"
          />
          <MandiFormField
            label="Photo of your pack (optional)"
            value={imageValue}
            onChangeText={setImageUrl}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            hint={
              sku.imageUrl
                ? 'Clear it to fall back to the catalog photo of the product.'
                : 'Restaurants see the catalog photo until you add your own.'
            }
          />
          <MandiFormField
            label="Selling price"
            value={priceValue}
            onChangeText={(text) => setSellingPrice(text.replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            required
            hint={`Per ${formatQuantity(sku.packSize)} ${sku.packUnit}, before GST.`}
          />

          <View>
            <MandiText variant="label">GST rate</MandiText>
            <View style={styles.chips}>
              {GST_RATES.map((rate) => {
                const active = Number(rate) === Number(gstValue);
                return (
                  <Pressable
                    key={rate}
                    onPress={() => setGstRate(rate)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <MandiText
                      variant="captionEmphasis"
                      color={active ? Colors.primary : Colors.textSecondary}
                    >
                      {rate}%
                    </MandiText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.actions}>
            <MandiButton
              label={sku.availability === 'AVAILABLE' ? 'Mark out of stock' : 'Mark available'}
              variant="secondary"
              size="md"
              loading={save.isPending}
              onPress={() => save.mutate({
                availability: sku.availability === 'AVAILABLE' ? 'OUT_OF_STOCK' : 'AVAILABLE',
              })}
              style={styles.flex}
            />
            <MandiButton
              label={sku.status === 'ACTIVE' ? 'Delist' : 'Relist'}
              variant="tertiary"
              size="md"
              loading={save.isPending}
              onPress={() => save.mutate({ status: sku.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
              style={styles.flex}
            />
          </View>
          <MandiText variant="caption" color={Colors.textTertiary}>
            Delisting hides it from restaurants. It is never deleted, because past orders
            reference it.
          </MandiText>

          {(history.data ?? []).length > 0 && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Price history</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Each change supersedes the last.
              </MandiText>
              {(history.data ?? []).slice(0, 8).map((entry, index) => (
                <View key={`${entry.effectiveFrom}-${index}`} style={styles.historyRow}>
                  <MandiText variant="body">{formatMoney(entry.sellingPrice)}</MandiText>
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    {entry.effectiveTo == null ? 'current' : `until ${shortDate(entry.effectiveTo)}`}
                  </MandiText>
                </View>
              ))}
            </MandiCard>
          )}

          <MandiButton
            label="Back to catalog"
            variant="tertiary"
            onPress={() => router.replace('/supplier/catalog')}
          />
        </>
      )}
    </MandiScreen>
  );
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
});
