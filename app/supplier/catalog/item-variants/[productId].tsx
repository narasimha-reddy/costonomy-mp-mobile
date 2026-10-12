import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  batchUpdateVariants,
  fetchItemVariants,
  type BatchVariantEntry,
  type ItemVariantGroupResponse,
  type VariantPreset,
} from '@/services/supplier';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'SUP-VARIANTS-01';
const STANDARD_GRADES = ['Grade A', 'Grade B', 'Grade C', 'Premium', 'Standard'];
const GST_RATES = ['0', '5', '12', '18'];
const COMMON_BRANDS = ['Amul', 'Nandini', 'Milky Mist', 'Loose / Unbranded'];

interface EditableVariant {
  id: string; // client temporary or existing sku id string
  skuId?: number | null;
  skuCode: string;
  name: string;
  brandName: string;
  grade: string;
  packSize: string;
  packUnit: string;
  mrp: string;
  sellingPrice: string;
  gstRate: string;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK';
  availableQuantity: string;
}

/**
 * Item-Centric Variant Management Screen.
 * Allows suppliers to select a canonical product (e.g. Paneer, Biryani Rice, Spices)
 * and manage all its brand and grade variants on one unified screen, starting with
 * recommended top-selling presets.
 */
export default function ItemVariantsScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const canonicalProductId = Number(productId);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const query = useQuery({
    queryKey: ['store', storeId, 'product', canonicalProductId, 'variants'],
    queryFn: () => fetchItemVariants(accessToken as string, storeId as number, canonicalProductId),
    enabled: Number.isFinite(canonicalProductId) && storeId != null && accessToken != null,
  });

  const [variants, setVariants] = useState<EditableVariant[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (query.data && !initialized) {
      const initial: EditableVariant[] = (query.data.variants ?? []).map((v) => ({
        id: String(v.id),
        skuId: v.id,
        skuCode: v.skuCode ?? '',
        name: v.name ?? '',
        brandName: v.brandName ?? '',
        grade: v.grade ?? '',
        packSize: String(Number(v.packSize || 1)),
        packUnit: v.packUnit || query.data.baseUnit || 'KG',
        mrp: v.mrp != null ? String(Number(v.mrp)) : '',
        sellingPrice: String(Number(v.sellingPrice || 0)),
        gstRate: String(Number(v.gstRate || 5)),
        availability: v.availability === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'AVAILABLE',
        availableQuantity: v.availableQuantity != null ? String(Number(v.availableQuantity)) : '',
      }));
      setVariants(initial);
      setInitialized(true);
    }
  }, [query.data, initialized]);

  const saveMutation = useMutation({
    mutationFn: (entries: BatchVariantEntry[]) =>
      batchUpdateVariants(accessToken as string, storeId as number, canonicalProductId, {
        canonicalProductId,
        variants: entries,
      }),
    onSuccess: () => {
      track('item_variants_saved', { screen: SCREEN, entityId: canonicalProductId });
      void queryClient.invalidateQueries({
        queryKey: ['store', storeId, 'product', canonicalProductId, 'variants'],
      });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'skus'] });
      toast.show('All variants saved successfully', 'success');
      setInitialized(false);
      router.back();
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not save variants.',
        'error',
      ),
  });

  const addVariantFromPreset = (preset: VariantPreset) => {
    const newVariant: EditableVariant = {
      id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      skuId: null,
      skuCode: '',
      name: `${preset.brandName} ${query.data?.productName ?? ''} ${preset.grade ?? ''}`.trim(),
      brandName: preset.brandName === 'Loose / Unbranded' ? '' : preset.brandName,
      grade: preset.grade ?? '',
      packSize: String(Number(preset.packSize || 1)),
      packUnit: preset.packUnit || query.data?.baseUnit || 'KG',
      mrp: preset.typicalMrp != null ? String(Number(preset.typicalMrp)) : '',
      sellingPrice: '',
      gstRate: '5',
      availability: 'AVAILABLE',
      availableQuantity: '50',
    };
    setVariants((prev) => [...prev, newVariant]);
  };

  const addCustomVariant = () => {
    const baseUnit = query.data?.baseUnit || 'KG';
    const newVariant: EditableVariant = {
      id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      skuId: null,
      skuCode: '',
      name: query.data?.productName ?? '',
      brandName: '',
      grade: '',
      packSize: '1',
      packUnit: baseUnit,
      mrp: '',
      sellingPrice: '',
      gstRate: '5',
      availability: 'AVAILABLE',
      availableQuantity: '',
    };
    setVariants((prev) => [...prev, newVariant]);
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const updateVariantField = <K extends keyof EditableVariant>(
    id: string,
    field: K,
    value: EditableVariant[K],
  ) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  };

  const canSave =
    variants.length > 0 &&
    variants.every(
      (v) =>
        Number(v.sellingPrice) > 0 &&
        Number(v.packSize) > 0 &&
        v.packUnit.trim().length > 0,
    );

  const handleSave = () => {
    if (!canSave) {
      toast.show('Please enter a valid price and pack size for all variants', 'error');
      return;
    }

    const payload: BatchVariantEntry[] = variants.map((v) => ({
      skuId: v.skuId ?? null,
      skuCode: v.skuCode.trim() || null,
      name:
        v.name.trim() ||
        `${v.brandName ? v.brandName + ' ' : ''}${query.data?.productName ?? 'Item'}${v.grade ? ' ' + v.grade : ''}`.trim(),
      brandName: v.brandName.trim() || null,
      grade: v.grade.trim() || null,
      packSize: v.packSize.trim(),
      packUnit: v.packUnit.trim(),
      mrp: v.mrp.trim() ? v.mrp.trim() : null,
      sellingPrice: v.sellingPrice.trim(),
      gstRate: v.gstRate.trim() || '5',
      availability: v.availability,
      availableQuantity: v.availableQuantity.trim() || null,
    }));

    saveMutation.mutate(payload);
  };

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={query.data?.productName ?? 'Manage item variants'}
          subtitle={query.data?.categoryName ? `${query.data.categoryName} · Brands & Grades` : undefined}
          back
        />
      }
      footer={
        <MandiStickyBar>
          <View style={styles.footerRow}>
            <View>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Configured Variants
              </MandiText>
              <MandiText variant="bodyEmphasis">
                {variants.length} variant{variants.length === 1 ? '' : 's'}
              </MandiText>
            </View>
            <MandiButton
              label="Save all variants"
              size="md"
              loading={saveMutation.isPending}
              disabled={!canSave}
              onPress={handleSave}
              fullWidth={false}
            />
          </View>
        </MandiStickyBar>
      }
      onRefresh={() => {
        setInitialized(false);
        query.refetch();
      }}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error || !query.data ? (
        <MandiErrorState
          message="Couldn't load item variants."
          onRetry={() => {
            setInitialized(false);
            query.refetch();
          }}
        />
      ) : (
        <>
          {/* Canonical Product Summary Banner */}
          <MandiCard>
            <View style={styles.productBanner}>
              <ProductThumb uri={query.data.imageUrl} size={48} radius={Radius.md} />
              <View style={styles.productBannerText}>
                <MandiText variant="bodyEmphasis">{query.data.productName}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {[
                    query.data.categoryName,
                    query.data.baseUnit ? `Base unit: ${query.data.baseUnit}` : null,
                  ].filter(Boolean).join(' · ')}
                </MandiText>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  Fulfill with multiple brands, grades (Grade A, Grade B), and custom MRP discounts.
                </MandiText>
              </View>
            </View>
          </MandiCard>

          {/* Top-Selling Preset Combinations Rail */}
          {query.data.recommendedPresets && query.data.recommendedPresets.length > 0 && (
            <View style={styles.presetSection}>
              <View style={styles.presetHeader}>
                <Ionicons name="sparkles" size={14} color={Colors.primary} />
                <MandiText variant="bodyEmphasis">Top-Selling Combination Presets</MandiText>
              </View>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Tap any preset below to quickly add popular brand and grade variants:
              </MandiText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRail}
              >
                {query.data.recommendedPresets.map((preset, idx) => {
                  return (
                    <Pressable
                      key={`${preset.brandName}-${preset.grade}-${idx}`}
                      onPress={() => addVariantFromPreset(preset)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${preset.brandName} ${preset.grade ?? ''}`}
                    >
                      <View style={styles.presetChipTop}>
                        <Ionicons name="add-circle" size={16} color={Colors.primary} />
                        <MandiText variant="captionEmphasis" color={Colors.textPrimary}>
                          {preset.brandName}
                        </MandiText>
                        {preset.grade ? (
                          <View style={styles.gradeBadge}>
                            <MandiText variant="caption" style={styles.gradeBadgeText}>
                              {preset.grade}
                            </MandiText>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.presetChipBottom}>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {preset.packSize} {preset.packUnit.toLowerCase()}
                        </MandiText>
                        {preset.typicalMrp != null && (
                          <MandiText variant="caption" color={Colors.textTertiary}>
                            MRP {formatMoney(preset.typicalMrp)}
                          </MandiText>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Section Action Bar */}
          <View style={styles.sectionActionBar}>
            <MandiText variant="bodyEmphasis">
              Variants ({variants.length})
            </MandiText>
            <MandiButton
              label="+ Add Custom Variant"
              size="sm"
              variant="secondary"
              onPress={addCustomVariant}
              fullWidth={false}
            />
          </View>

          {/* Variant Cards List */}
          {variants.length === 0 ? (
            <MandiCard>
              <View style={styles.emptyVariants}>
                <Ionicons name="layers-outline" size={32} color={Colors.textTertiary} />
                <MandiText variant="bodyEmphasis" color={Colors.textSecondary}>
                  No variants added yet
                </MandiText>
                <MandiText variant="caption" color={Colors.textTertiary} style={styles.textCenter}>
                  Tap a top-selling preset above or "+ Add Custom Variant" to start listing brands and grades.
                </MandiText>
              </View>
            </MandiCard>
          ) : (
            variants.map((v, index) => {
              const mrpNum = Number(v.mrp || 0);
              const priceNum = Number(v.sellingPrice || 0);
              const hasDiscount = mrpNum > priceNum && priceNum > 0;
              const discountPercent = hasDiscount
                ? Math.round(((mrpNum - priceNum) / mrpNum) * 100)
                : 0;
              const savingsAmount = hasDiscount ? (mrpNum - priceNum).toFixed(2) : '0';

              return (
                <MandiCard key={v.id}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderTitle}>
                      <MandiText variant="bodyEmphasis">
                        #{index + 1} {v.brandName || 'Unbranded'} {v.grade ? `(${v.grade})` : ''}
                      </MandiText>
                      {v.grade ? (
                        <View style={styles.gradeBadge}>
                          <MandiText variant="caption" style={styles.gradeBadgeText}>
                            {v.grade}
                          </MandiText>
                        </View>
                      ) : null}
                      {hasDiscount && (
                        <View style={styles.discountBadge}>
                          <MandiText variant="caption" style={styles.discountBadgeText}>
                            {discountPercent}% OFF
                          </MandiText>
                        </View>
                      )}
                    </View>
                    <Pressable
                      onPress={() => removeVariant(v.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove variant"
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </Pressable>
                  </View>

                  {/* Brand Selector */}
                  <View style={styles.fieldSection}>
                    <MandiText variant="label">Brand name</MandiText>
                    <View style={styles.chipRow}>
                      {COMMON_BRANDS.map((b) => {
                        const isLoose = b === 'Loose / Unbranded';
                        const isSelected = isLoose ? v.brandName === '' : v.brandName === b;
                        return (
                          <Pressable
                            key={b}
                            onPress={() =>
                              updateVariantField(v.id, 'brandName', isLoose ? '' : b)
                            }
                            style={[styles.smallChip, isSelected && styles.smallChipSelected]}
                          >
                            <MandiText
                              variant="caption"
                              color={isSelected ? Colors.primary : Colors.textPrimary}
                            >
                              {b}
                            </MandiText>
                          </Pressable>
                        );
                      })}
                    </View>
                    <MandiFormField
                      label="Custom brand (if other)"
                      value={v.brandName}
                      onChangeText={(val) => updateVariantField(v.id, 'brandName', val)}
                      placeholder="e.g. Heritage, Aashirvaad"
                    />
                  </View>

                  {/* Grade Selector */}
                  <View style={styles.fieldSection}>
                    <MandiText variant="label">Grade / quality tier</MandiText>
                    <View style={styles.chipRow}>
                      {STANDARD_GRADES.map((g) => {
                        const isSelected = v.grade === g;
                        return (
                          <Pressable
                            key={g}
                            onPress={() =>
                              updateVariantField(v.id, 'grade', isSelected ? '' : g)
                            }
                            style={[styles.smallChip, isSelected && styles.smallChipSelected]}
                          >
                            <MandiText
                              variant="caption"
                              color={isSelected ? Colors.primary : Colors.textPrimary}
                            >
                              {g}
                            </MandiText>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => updateVariantField(v.id, 'grade', '')}
                        style={[styles.smallChip, v.grade === '' && styles.smallChipSelected]}
                      >
                        <MandiText
                          variant="caption"
                          color={v.grade === '' ? Colors.primary : Colors.textSecondary}
                        >
                          None
                        </MandiText>
                      </Pressable>
                    </View>
                    <MandiFormField
                      label="Custom grade (if other)"
                      value={STANDARD_GRADES.includes(v.grade) ? '' : v.grade}
                      onChangeText={(val) => updateVariantField(v.id, 'grade', val)}
                      placeholder="e.g. Export Grade"
                    />
                  </View>

                  {/* Pack Size & Unit */}
                  <View style={styles.twoCol}>
                    <MandiFormField
                      label="Pack size"
                      value={v.packSize}
                      onChangeText={(val) =>
                        updateVariantField(v.id, 'packSize', val.replace(/[^\d.]/g, ''))
                      }
                      keyboardType="decimal-pad"
                      placeholder="1"
                      style={styles.flex}
                      required
                    />
                    <MandiFormField
                      label="Pack unit"
                      value={v.packUnit}
                      onChangeText={(val) =>
                        updateVariantField(v.id, 'packUnit', val.toUpperCase())
                      }
                      placeholder="KG"
                      style={styles.flex}
                      required
                    />
                  </View>

                  {/* MRP and Selling Price with Live Discount */}
                  <View style={styles.twoCol}>
                    <MandiFormField
                      label="MRP (₹, optional)"
                      value={v.mrp}
                      onChangeText={(val) =>
                        updateVariantField(v.id, 'mrp', val.replace(/[^\d.]/g, ''))
                      }
                      keyboardType="decimal-pad"
                      placeholder="e.g. 500"
                      style={styles.flex}
                      hint="Optional for loose items"
                    />
                    <MandiFormField
                      label="Selling Price (₹)"
                      value={v.sellingPrice}
                      onChangeText={(val) =>
                        updateVariantField(v.id, 'sellingPrice', val.replace(/[^\d.]/g, ''))
                      }
                      keyboardType="decimal-pad"
                      placeholder="e.g. 420"
                      style={styles.flex}
                      required
                      hint="Supplier price"
                    />
                  </View>

                  {/* Live Discount Callout */}
                  {hasDiscount && (
                    <View style={styles.savingsCallout}>
                      <Ionicons name="pricetag" size={14} color="#E65100" />
                      <MandiText variant="captionEmphasis" color="#E65100">
                        Restaurant sees: Save ₹{savingsAmount} · {discountPercent}% OFF against MRP
                      </MandiText>
                    </View>
                  )}

                  {/* GST & Stock Availability */}
                  <View style={styles.twoCol}>
                    <View style={styles.flex}>
                      <MandiText variant="label">GST rate</MandiText>
                      <View style={styles.chipRow}>
                        {GST_RATES.map((rate) => {
                          const isSelected = v.gstRate === rate;
                          return (
                            <Pressable
                              key={rate}
                              onPress={() => updateVariantField(v.id, 'gstRate', rate)}
                              style={[styles.smallChip, isSelected && styles.smallChipSelected]}
                            >
                              <MandiText
                                variant="caption"
                                color={isSelected ? Colors.primary : Colors.textPrimary}
                              >
                                {rate}%
                              </MandiText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.flex}>
                      <MandiText variant="label">Stock status</MandiText>
                      <View style={styles.chipRow}>
                        <Pressable
                          onPress={() => updateVariantField(v.id, 'availability', 'AVAILABLE')}
                          style={[
                            styles.smallChip,
                            v.availability === 'AVAILABLE' && styles.availableChipSelected,
                          ]}
                        >
                          <MandiText
                            variant="caption"
                            color={v.availability === 'AVAILABLE' ? Colors.success : Colors.textPrimary}
                          >
                            In Stock
                          </MandiText>
                        </Pressable>
                        <Pressable
                          onPress={() => updateVariantField(v.id, 'availability', 'OUT_OF_STOCK')}
                          style={[
                            styles.smallChip,
                            v.availability === 'OUT_OF_STOCK' && styles.outChipSelected,
                          ]}
                        >
                          <MandiText
                            variant="caption"
                            color={v.availability === 'OUT_OF_STOCK' ? Colors.danger : Colors.textPrimary}
                          >
                            Out of Stock
                          </MandiText>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {/* Stock Quantity */}
                  <MandiFormField
                    label="Available Quantity (optional)"
                    value={v.availableQuantity}
                    onChangeText={(val) =>
                      updateVariantField(v.id, 'availableQuantity', val.replace(/[^\d.]/g, ''))
                    }
                    keyboardType="decimal-pad"
                    placeholder="e.g. 100"
                    hint="Units or packs ready for delivery"
                  />
                </MandiCard>
              );
            })
          )}
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  textCenter: { textAlign: 'center' },
  pressed: { opacity: 0.75 },
  productBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  productBannerText: {
    flex: 1,
    gap: 2,
  },
  presetSection: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  presetRail: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  presetChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    backgroundColor: '#F1F8E9',
    gap: 2,
    minWidth: 120,
  },
  presetChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  presetChipBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  sectionActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  emptyVariants: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  cardHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  gradeBadge: {
    backgroundColor: '#EDE7F6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1C4E9',
  },
  gradeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5E35B1',
  },
  discountBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFE0B2',
  },
  discountBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E65100',
  },
  fieldSection: {
    gap: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  smallChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  smallChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  availableChipSelected: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight,
  },
  outChipSelected: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerLight,
  },
  twoCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  savingsCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    backgroundColor: '#FFF3E0',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
});
