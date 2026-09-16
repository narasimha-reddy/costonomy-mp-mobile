import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchPriceHistory, fetchSkus, updateSku, uploadSkuImage } from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiImagePicker,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney, formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { ProductThumb } from '@/components/product/ProductThumb';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

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

  /**
   * Changed is not the same as saveable. A cleared name or a zero price are
   * changes, and the server would refuse both — so the button stays disabled
   * rather than offering an action that cannot work.
   */
  const canSave = nameValue.trim().length > 1 && Number(priceValue) > 0;

  return (
    <MandiScreen
      header={
        // The canonical product *is* the header: its picture, its name, and the
        // supplier's own name for it underneath. Repeating it in a "Listed
        // against" card below said the same thing twice and made the screen read
        // as being about two products.
        <MandiHeader
          leading={<ProductThumb uri={sku?.canonicalProductImageUrl} size={40} />}
          title={sku?.canonicalProductName ?? 'Product'}
          subtitle={
            sku && sku.name !== sku.canonicalProductName ? `Your listing: ${sku.name}` : undefined
          }
          back
        />
      }
      footer={
        // Always present, disabled until there is something to save. Appearing
        // only once a field changes made the bar arrive under the thumb mid-edit
        // and moved the content up as it did — and a supplier who cannot see a
        // save button has no way to know whether this screen saves at all.
        sku != null ? (
          <MandiStickyBar>
            {priceChanged && (
              <MandiText variant="caption" color={Colors.textSecondary} center>
                A new price applies to new orders only. Orders already placed keep theirs.
              </MandiText>
            )}
            <MandiButton
              label="Save changes"
              size="lg"
              disabled={!dirty || !canSave}
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
          <MandiFormField label="Product name" value={nameValue} onChangeText={setName} required />
          <MandiFormField
            label="Brand (optional)"
            value={brandValue}
            onChangeText={setBrandName}
            placeholder="Amul"
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

          {/* The only picture on this screen now, and it is the supplier's own.
              Empty shows the catalog photo, which is what a restaurant would see,
              so the control states the outcome rather than describing a rule. */}
          <MandiImagePicker
            label="Photo of your pack (optional)"
            value={imageValue.trim() || null}
            fallbackUri={sku.canonicalProductImageUrl}
            onChange={(url) => setImageUrl(url ?? '')}
            onUpload={async (file) => {
              const uploaded = await uploadSkuImage(
                accessToken as string, storeId as number, file);
              return uploaded.url;
            }}
            hint={
              imageValue.trim()
                ? 'Remove it to go back to the catalog photo of the product.'
                : 'This is the catalog photo. Add your own to show your actual pack.'
            }
            placeholderHint="Restaurants see this beside your price."
          />

          {/* Two state changes, not two buttons competing with Save.
              As a pair of outlined pills they read as equal alternatives to the
              primary action and to each other, which neither is: one is a daily
              toggle, the other takes the listing off the market. As rows they
              state what is true now and what the tap would do, and the caption
              that used to float under them belongs to the row it explains. */}
          <MandiCard style={styles.stateCard}>
            <StateRow
              icon={sku.availability === 'AVAILABLE' ? 'close-circle-outline' : 'checkmark-circle-outline'}
              tint={sku.availability === 'AVAILABLE' ? Colors.warning : Colors.success}
              background={sku.availability === 'AVAILABLE' ? Colors.warningLight : Colors.successLight}
              label={sku.availability === 'AVAILABLE' ? 'Mark out of stock' : 'Mark available'}
              detail={
                sku.availability === 'AVAILABLE'
                  ? 'Restaurants can order this right now.'
                  : 'Restaurants cannot order this until you mark it available.'
              }
              busy={save.isPending}
              onPress={() => save.mutate({
                availability: sku.availability === 'AVAILABLE' ? 'OUT_OF_STOCK' : 'AVAILABLE',
              })}
            />
            <View style={styles.stateDivider} />
            <StateRow
              icon={sku.status === 'ACTIVE' ? 'eye-off-outline' : 'eye-outline'}
              tint={sku.status === 'ACTIVE' ? Colors.textSecondary : Colors.success}
              background={sku.status === 'ACTIVE' ? Colors.surfaceSunken : Colors.successLight}
              label={sku.status === 'ACTIVE' ? 'Delist' : 'Relist'}
              detail={
                sku.status === 'ACTIVE'
                  ? 'Hides it from restaurants. Never deleted — past orders reference it.'
                  : 'Currently hidden from restaurants.'
              }
              busy={save.isPending}
              onPress={() => save.mutate({
                status: sku.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
              })}
            />
          </MandiCard>

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
        </>
      )}
    </MandiScreen>
  );
}

/**
 * One state change, stated as what is true and what the tap would do.
 *
 * <p>A row rather than a button because these are not alternatives to saving.
 * Side by side as outlined pills they read as equal in weight to the primary
 * action and to each other, and they are neither: marking stock is a daily
 * toggle, delisting takes the listing off the market. A row has space to say
 * which is which.
 */
function StateRow({
  icon,
  tint,
  background,
  label,
  detail,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  background: string;
  label: string;
  detail: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [styles.stateRow, pressed && styles.statePressed, busy && styles.stateBusy]}
    >
      <View style={[styles.stateIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{label}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{detail}</MandiText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
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
  stateCard: { padding: 0, gap: 0, overflow: 'hidden' },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: TouchTarget.min,
  },
  statePressed: { backgroundColor: Colors.surfaceSunken },
  stateBusy: { opacity: 0.6 },
  stateIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 68 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
});
