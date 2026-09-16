import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchCategories, fetchProducts } from '@/services/catalog';
import { createSku, fetchSkus } from '@/services/supplier';
import { categoryFace } from '@/models/categories';
import type { Category, Product } from '@/models/catalog';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiStepBar,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Elevation, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'SUP-CATALOG-02';
const STEPS = ['Choose the product', 'Pack and price'];
const UNITS = ['KG', 'L', 'PIECE', 'DOZEN', 'BOX'];
const GST_RATES = ['0', '5', '12', '18'];

/** Big enough to hold the whole catalog in one call; the server pages at 20. */
const PAGE_SIZE = 200;

/**
 * SUP-CATALOG-02. Doc 05 §29.
 *
 * <p><b>You browse the platform catalog, you do not search it blind.</b> A search
 * box asks a supplier to guess what a product is called here before they can list
 * anything — and a wrong guess looks identical to "we don't stock that". Browsing
 * by category shows them the actual vocabulary, which is the thing they need to
 * learn once and then never think about again. The filter above the list narrows
 * what is already on screen rather than querying into the dark.
 *
 * <p><b>A SKU is tied to a canonical product</b>, and that link is what puts this
 * listing into a restaurant's comparison against every other supplier. There is
 * deliberately no API for a supplier to invent a canonical product (doc 01 §7) —
 * one invented per supplier could never be compared with anything.
 *
 * <p>Products this store already lists are marked and route to the editor instead
 * of the form, because the useful action there is changing a price, not creating
 * a second listing of the same thing.
 */
export default function NewSkuScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [step, setStep] = useState(0);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [packSize, setPackSize] = useState('1');
  const [packUnit, setPackUnit] = useState('KG');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState('5');

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  const products = useQuery({
    queryKey: ['products', { categoryId, size: PAGE_SIZE }],
    queryFn: () => fetchProducts(accessToken as string, { categoryId, size: PAGE_SIZE }),
    enabled: accessToken != null,
  });

  const listed = useQuery({
    queryKey: ['store', storeId, 'skus'],
    queryFn: () => fetchSkus(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  /** canonicalProductId → the SKU this store already has for it. */
  const alreadyListed = useMemo(() => {
    const map = new Map<number, number>();
    (listed.data ?? []).forEach((sku) => {
      if (!map.has(sku.canonicalProductId)) map.set(sku.canonicalProductId, sku.id);
    });
    return map;
  }, [listed.data]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const all = products.data ?? [];
    return term.length === 0
      ? all
      : all.filter((item) => item.name.toLowerCase().includes(term));
  }, [products.data, filter]);

  /**
   * When browsing everything, group under category headings rather than one long
   * list — and order the groups the way the category tabs are ordered, not the
   * way product ids happen to fall. Otherwise "Cleaning & Hygiene" leads the
   * catalog of a food marketplace, purely because those rows were seeded first.
   */
  const grouped = useMemo(() => {
    if (categoryId != null) return null;

    const byCategory = new Map<string, Product[]>();
    visible.forEach((item) => {
      const key = item.categoryName ?? 'Other';
      byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
    });

    const order = new Map((categories.data ?? []).map((c, index) => [c.name, index]));
    return [...byCategory.entries()].sort(
      ([a], [b]) => (order.get(a) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [visible, categoryId, categories.data]);

  function choose(chosen: Product) {
    const existing = alreadyListed.get(chosen.id);
    if (existing != null) {
      track('sku_open_existing', { screen: SCREEN, entityId: existing });
      router.replace(`/supplier/catalog/${existing}`);
      return;
    }
    track('sku_product_chosen', { screen: SCREEN, entityId: chosen.id });
    setProduct(chosen);
    setName(chosen.name);
    setPackUnit(chosen.baseUnit || 'KG');
    setPackSize(String(chosen.basePackSize ?? '1').replace(/\.0+$/, ''));
    setStep(1);
  }

  const create = useMutation({
    mutationFn: () =>
      createSku(accessToken as string, storeId as number, {
        canonicalProductId: (product as Product).id,
        name: name.trim(),
        brandName: brandName.trim() || undefined,
        skuCode: skuCode.trim() || undefined,
        packSize: packSize.trim(),
        packUnit,
        sellingPrice: sellingPrice.trim(),
        gstRate,
        availability: 'AVAILABLE',
      }),
    onSuccess: (sku) => {
      track('sku_created', { screen: SCREEN, entityId: sku.id },
        { canonicalProductId: product?.id });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'skus'] });
      toast.show(`${sku.name} is live`, 'success');
      // `replace`, not `back`: this screen can be reached by a deep link with no
      // history behind it, and `back` would then do nothing at all.
      router.replace('/supplier/catalog');
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not list that product.',
        'error',
      ),
  });

  const priceValid = Number(sellingPrice) > 0;
  const packValid = Number(packSize) > 0;
  const canSave = product != null && name.trim().length > 1 && priceValid && packValid;

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={step === 0 ? 'Add to your catalog' : 'Pack and price'}
          back
          onBack={() => (step === 0 ? router.replace('/supplier/catalog') : setStep(0))}
        />
      }
      footer={
        step === 1 ? (
          <MandiStickyBar>
            <View style={styles.summaryRow}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Restaurants will see
              </MandiText>
              <MandiText variant="priceLarge">
                {priceValid ? formatMoney(sellingPrice) : '—'}
              </MandiText>
            </View>
            <MandiButton
              label="Add to catalog"
              size="lg"
              disabled={!canSave}
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          </MandiStickyBar>
        ) : undefined
      }
    >
      <MandiStepBar step={step + 1} total={STEPS.length} label={STEPS[step] as string} />

      {step === 0 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">What do you stock?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              Pick from the platform catalog so restaurants can compare your price
              against other suppliers. Tap anything to set your price.
            </MandiText>
          </View>

          <CategoryTabs
            categories={categories.data ?? []}
            selected={categoryId}
            onSelect={(id) => {
              setCategoryId(id);
              setFilter('');
            }}
          />

          {(products.data ?? []).length > 8 && (
            <MandiSearchBar
              value={filter}
              onChangeText={setFilter}
              placeholder="Narrow this list"
            />
          )}

          {products.isPending ? (
            <MandiSkeletonList count={5} />
          ) : products.error ? (
            <MandiErrorState
              message="Couldn't load the catalog."
              onRetry={() => products.refetch()}
            />
          ) : visible.length === 0 ? (
            <MandiEmptyState
              icon="help-circle-outline"
              title={filter ? `Nothing here matches "${filter}"` : 'Nothing in this category yet'}
              description="If something you stock genuinely isn't in the catalog, tell us and we'll add it."
            />
          ) : grouped != null ? (
            grouped.map(([category, items]) => (
              <View key={category} style={styles.group}>
                <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
                  {category.toUpperCase()}
                </MandiText>
                {items.map((item) => (
                  <ProductRow
                    key={item.id}
                    product={item}
                    listed={alreadyListed.has(item.id)}
                    onPress={() => choose(item)}
                  />
                ))}
              </View>
            ))
          ) : (
            visible.map((item) => (
              <ProductRow
                key={item.id}
                product={item}
                listed={alreadyListed.has(item.id)}
                onPress={() => choose(item)}
              />
            ))
          )}
        </>
      )}

      {step === 1 && product != null && (
        <>
          <MandiCard>
            <View style={styles.chosen}>
              <View
                style={[
                  styles.chosenIcon,
                  { backgroundColor: categoryFace(product.categoryName).background },
                ]}
              >
                <Ionicons
                  name={categoryFace(product.categoryName).icon}
                  size={20}
                  color={categoryFace(product.categoryName).tint}
                />
              </View>
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis">{product.name}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {product.categoryName}
                  {product.offerCount
                    ? ` · ${product.offerCount} suppliers already listing this`
                    : ''}
                </MandiText>
              </View>
              <Pressable
                onPress={() => setStep(0)}
                accessibilityRole="button"
                accessibilityLabel="Choose a different product"
              >
                <MandiText variant="captionEmphasis" color={Colors.primary}>Change</MandiText>
              </Pressable>
            </View>
            {product.lowestPrice != null && (
              <MandiText variant="caption" color={Colors.textTertiary}>
                Cheapest right now: {formatMoney(product.lowestPrice)}
              </MandiText>
            )}
          </MandiCard>

          <MandiFormField
            label="Your name for it"
            value={name}
            onChangeText={setName}
            placeholder={product.name}
            required
            hint="What appears on the order. Defaults to the platform name."
          />
          <MandiFormField
            label="Brand (optional)"
            value={brandName}
            onChangeText={setBrandName}
            placeholder="Amul"
          />

          <View style={styles.row}>
            <MandiFormField
              label="Pack size"
              value={packSize}
              onChangeText={(text) => setPackSize(text.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              required
              style={styles.flex}
            />
            <View style={styles.flex}>
              <MandiText variant="label">Unit</MandiText>
              <View style={styles.chips}>
                {UNITS.map((unit) => (
                  <Chip
                    key={unit}
                    label={unit}
                    active={unit === packUnit}
                    onPress={() => setPackUnit(unit)}
                  />
                ))}
              </View>
            </View>
          </View>

          <MandiFormField
            label="Selling price"
            value={sellingPrice}
            onChangeText={(text) => setSellingPrice(text.replace(/[^\d.]/g, ''))}
            placeholder="410"
            keyboardType="decimal-pad"
            required
            hint={`Per ${packSize || '1'} ${packUnit}, before GST.`}
          />

          <View>
            <MandiText variant="label">GST rate</MandiText>
            <View style={styles.chips}>
              {GST_RATES.map((rate) => (
                <Chip
                  key={rate}
                  label={`${rate}%`}
                  active={rate === gstRate}
                  onPress={() => setGstRate(rate)}
                />
              ))}
            </View>
          </View>

          <MandiFormField
            label="Your SKU code (optional)"
            value={skuCode}
            onChangeText={setSkuCode}
            placeholder="PNR-1KG"
            hint="Only for your own records. Restaurants never see it."
          />
        </>
      )}
    </MandiScreen>
  );
}

function CategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
    >
      <Tab label="All" active={selected == null} onPress={() => onSelect(null)} />
      {categories.map((category) => (
        <Tab
          key={category.id}
          label={category.name}
          active={selected === category.id}
          onPress={() => onSelect(category.id)}
        />
      ))}
    </ScrollView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <MandiText
        variant="captionEmphasis"
        color={active ? Colors.textInverse : Colors.textSecondary}
      >
        {label}
      </MandiText>
    </Pressable>
  );
}

function ProductRow({
  product,
  listed,
  onPress,
}: {
  product: Product;
  listed: boolean;
  onPress: () => void;
}) {
  const face = categoryFace(product.categoryName);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        listed
          ? `${product.name}, already in your catalog. Edit it.`
          : `List ${product.name}`
      }
      style={({ pressed }) => [styles.productRow, pressed && styles.pressed]}
    >
      <View style={[styles.chosenIcon, { backgroundColor: face.background }]}>
        <Ionicons name={face.icon} size={20} color={face.tint} />
      </View>

      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{product.name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {product.baseUnit ? `Sold per ${product.baseUnit}` : ''}
          {product.offerCount ? ` · ${product.offerCount} listing this` : ''}
        </MandiText>
      </View>

      <View style={styles.trailing}>
        {listed ? (
          <View style={styles.listedPill}>
            <Ionicons name="checkmark" size={12} color={Colors.success} />
            <MandiText variant="caption" color={Colors.success}>In catalog</MandiText>
          </View>
        ) : product.lowestPrice != null ? (
          <MandiText variant="caption" color={Colors.textTertiary}>
            from {formatMoney(product.lowestPrice, true)}
          </MandiText>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </View>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <MandiText variant="captionEmphasis" color={active ? Colors.primary : Colors.textSecondary}>
        {label}
      </MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.md },
  group: { gap: Spacing.sm },
  tabs: { gap: Spacing.sm, paddingRight: Spacing.md },
  tab: {
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  tabActive: { backgroundColor: Colors.primary },
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
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    ...Elevation.card,
  },
  pressed: { opacity: 0.75 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  listedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.successLight,
  },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  chosenIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
