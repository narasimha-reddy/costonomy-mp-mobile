import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchCategories, fetchProducts, fetchUnits } from '@/services/catalog';
import { createSku, fetchSkus, uploadSkuImage } from '@/services/supplier';
import { categoryFace } from '@/models/categories';
import { ProductThumb } from '@/components/product/ProductThumb';
import { CategoryTabs } from '@/components/product/CategoryTabs';
import { PackFields } from '@/components/product/PackFields';
import type { Product } from '@/models/catalog';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiImagePicker,
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
import { radioProps } from '@/lib/a11y';

const SCREEN = 'SUP-CATALOG-02';
const STEPS = ['Choose the product', 'Pack and price'];
const GST_RATES = ['0', '5', '12', '18'];
const STANDARD_GRADES = ['Grade A', 'Grade B', 'Grade C', 'Premium', 'Standard'];

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
  const [grade, setGrade] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [packSize, setPackSize] = useState('1');
  const [packUnit, setPackUnit] = useState('KG');
  const [mrp, setMrp] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [measureValue, setMeasureValue] = useState('');
  const [measureUnit, setMeasureUnit] = useState('GM');
  const [imageUrl, setImageUrl] = useState('');

  /**
   * The optional detail. D-096.
   *
   * <p>All of it can be left blank. A listing with none of it behaves exactly
   * as it did before the detail page existed, which is why none of it gates
   * saving.
   */
  const [description, setDescription] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [gallery, setGallery] = useState<string[]>([]);

  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => fetchUnits(accessToken as string),
    enabled: accessToken != null,
    // The vocabulary changes when the server is deployed, not while a supplier
    // is filling in a form.
    staleTime: 60 * 60 * 1000,
  });

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

  /**
   * canonicalProductId → how many SKUs this store already lists under it.
   *
   * <p>A count rather than "the one SKU", because there is no longer one: a
   * supplier may list the same product in several packs, and the row says how
   * many they have rather than whether they have any.
   */
  const skuCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (listed.data ?? []).forEach((sku) => {
      counts.set(sku.canonicalProductId, (counts.get(sku.canonicalProductId) ?? 0) + 1);
    });
    return counts;
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

  /**
   * Start a listing for this product.
   *
   * <p><b>Already listing it is not a reason to stop.</b> This used to bounce
   * to the existing SKU, which made one listing per product a rule the screen
   * enforced rather than one anybody decided — and a supplier selling paneer in
   * a 200 g tub and a 5 kg block has two things to sell. The count on the row
   * says how many they already have; the rest of the form is the same.
   */
  function choose(chosen: Product) {
    track('sku_product_chosen', { screen: SCREEN, entityId: chosen.id });
    setProduct(chosen);
    setName(chosen.name);
    // The canonical product's unit, as the starting point. Most SKUs are sold in
    // the unit their product is measured in, and a supplier who sells packets
    // changes it — which is cheaper than making everyone choose from fifteen.
    setPackUnit(chosen.baseUnit || 'KG');
    setPackSize(String(chosen.basePackSize ?? '1').replace(/\.0+$/, ''));
    setMeasureValue('');
    setMeasureUnit('GM');
    setStep(1);
  }

  // Declared before the mutation below, whose callbacks read it (no-tdz).
  const needsMeasure = (units.data?.requiresMeasure ?? []).includes(packUnit);

  const create = useMutation({
    mutationFn: () =>
      createSku(accessToken as string, storeId as number, {
        canonicalProductId: (product as Product).id,
        name: name.trim(),
        brandName: brandName.trim() || undefined,
        grade: grade.trim() || undefined,
        skuCode: skuCode.trim() || undefined,
        packSize: packSize.trim(),
        packUnit,
        // Sent only when the pack unit calls for it — the server refuses a
        // measure on a unit that already states an amount.
        measureValue: needsMeasure ? measureValue.trim() : undefined,
        measureUnit: needsMeasure ? measureUnit : undefined,
        mrp: mrp.trim() ? mrp.trim() : undefined,
        sellingPrice: sellingPrice.trim(),
        gstRate,
        imageUrl: imageUrl.trim() || undefined,
        description: description.trim() || undefined,
        lengthCm: lengthCm.trim() || undefined,
        widthCm: widthCm.trim() || undefined,
        heightCm: heightCm.trim() || undefined,
        weightGrams: weightGrams.trim() || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
        images: gallery.length > 0 ? gallery : undefined,
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
  // A container with no contents is a listing nobody can compare, so it cannot
  // be saved — the server refuses it, and the button should not offer it.
  const measureValid = !needsMeasure || (Number(measureValue) > 0 && measureUnit !== '');
  const canSave = product != null && name.trim().length > 1
    && priceValid && packValid && measureValid;

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
              label="Add To Catalog"
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

          {/* Always present, not only once the list is long: a supplier who knows
              the name should never have to scroll to find the box. */}
          <MandiSearchBar
            value={filter}
            onChangeText={setFilter}
            placeholder="Search this category"
          />

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
                    skuCount={skuCounts.get(item.id) ?? 0}
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
                skuCount={skuCounts.get(item.id) ?? 0}
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
              {/* Still the canonical picture: this card says which platform
                  product the new SKU maps onto, so it must show that product
                  and not the pack the supplier is about to describe. */}
              {product.imageUrl ? (
                <ProductThumb uri={product.imageUrl} size={40} radius={Radius.md} />
              ) : (
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
              )}
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

          <View style={styles.gradeSection}>
            <MandiText variant="label">Grade (optional)</MandiText>
            <View style={styles.chips}>
              {STANDARD_GRADES.map((g) => (
                <Chip
                  key={g}
                  label={g}
                  active={grade === g}
                  onPress={() => setGrade(grade === g ? '' : g)}
                />
              ))}
            </View>
            <MandiFormField
              label="Custom grade (if not above)"
              value={STANDARD_GRADES.includes(grade) ? '' : grade}
              onChangeText={setGrade}
              placeholder="e.g. Export Grade"
              hint="Useful for commodities: Grade A, Grade B, Premium, etc."
            />
          </View>

          <PackFields
            packSize={packSize}
            onPackSize={setPackSize}
            packUnit={packUnit}
            onPackUnit={setPackUnit}
            measureValue={measureValue}
            onMeasureValue={setMeasureValue}
            measureUnit={measureUnit}
            onMeasureUnit={setMeasureUnit}
            units={units.data}
          />

          <MandiFormField
            label="MRP (optional for loose items)"
            value={mrp}
            onChangeText={(text) => setMrp(text.replace(/[^\d.]/g, ''))}
            placeholder="500"
            keyboardType="decimal-pad"
            hint="Printed maximum retail price. Leave empty for loose/unbranded commodities."
          />
          {Number(mrp) > Number(sellingPrice) && Number(sellingPrice) > 0 && (
            <View style={styles.discountPreview}>
              <Ionicons name="pricetag-outline" size={14} color="#E65100" />
              <MandiText variant="captionEmphasis" color="#E65100">
                Buyer savings: {Math.round(((Number(mrp) - Number(sellingPrice)) / Number(mrp)) * 100)}% OFF (Save ₹{(Number(mrp) - Number(sellingPrice)).toFixed(2)})
              </MandiText>
            </View>
          )}

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

          <MandiImagePicker
            label="Photo of your pack (optional)"
            value={imageUrl || null}
            fallbackUri={product.imageUrl}
            onChange={(url) => setImageUrl(url ?? '')}
            onUpload={async (file) => {
              const uploaded = await uploadSkuImage(
                accessToken as string, storeId as number, file);
              return uploaded.url;
            }}
            hint="Remove it to use the catalog photo instead."
            placeholderHint={
              product.imageUrl
                ? 'This is the catalog photo. Add your own to show your actual pack.'
                : 'This product has no catalog photo, so yours is the only one.'
            }
          />

          {/* Everything below is optional and none of it gates saving. D-096.
              It is what a kitchen reads on the pack's own page when they are
              deciding rather than comparing. */}
          <MandiFormField
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="What it is, how it is packed, how to store it"
            multiline
            hint="Restaurants see this on the product page."
          />

          <View style={styles.pair}>
            <MandiFormField
              label="Length (cm)"
              value={lengthCm}
              onChangeText={(text) => setLengthCm(text.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="40"
              style={styles.flex}
            />
            <MandiFormField
              label="Width (cm)"
              value={widthCm}
              onChangeText={(text) => setWidthCm(text.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="25"
              style={styles.flex}
            />
          </View>

          <View style={styles.pair}>
            <MandiFormField
              label="Height (cm)"
              value={heightCm}
              onChangeText={(text) => setHeightCm(text.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="15"
              style={styles.flex}
            />
            <MandiFormField
              label="Weight (g)"
              value={weightGrams}
              onChangeText={(text) => setWeightGrams(text.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="25000"
              style={styles.flex}
              hint="Used for delivery."
            />
          </View>

          <MandiFormField
            label="YouTube link (optional)"
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="https://youtube.com/watch?v=..."
            autoCapitalize="none"
            hint="Paste a link. Uploading video isn't supported yet."
          />

          <View style={styles.gallery}>
            <MandiText variant="bodyEmphasis">More photos (optional)</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              The photo above stays the one restaurants see in lists. These are
              the rest — angles, the label, what is inside.
            </MandiText>

            {gallery.map((url, index) => (
              <View key={`${url}-${index}`} style={styles.galleryRow}>
                <ProductThumb uri={url} size={44} radius={Radius.sm} />
                <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                  Photo {index + 2}
                </MandiText>
                <Pressable
                  onPress={() => setGallery(gallery.filter((_, at) => at !== index))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 2}`}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={Colors.textTertiary} />
                </Pressable>
              </View>
            ))}

            <MandiImagePicker
              label=""
              value={null}
              onChange={() => undefined}
              onUpload={async (file) => {
                const uploaded = await uploadSkuImage(
                  accessToken as string, storeId as number, file);
                setGallery((current) => [...current, uploaded.url]);
                return uploaded.url;
              }}
              placeholderHint="Add another photo"
            />
          </View>

        </>
      )}
    </MandiScreen>
  );
}

function ProductRow({
  product,
  skuCount,
  onPress,
}: {
  product: Product;
  /** How many SKUs this store already lists under this product. */
  skuCount: number;
  onPress: () => void;
}) {
  const face = categoryFace(product.categoryName);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        skuCount > 0
          ? `List another pack of ${product.name}. You already list ${skuCount}.`
          : `List ${product.name}`
      }
      style={({ pressed }) => [styles.productRow, pressed && styles.pressed]}
    >
      {/* The canonical picture, always — this screen is the platform catalog, and
          a supplier's own pack does not exist here yet. Where a product has no
          photograph the category tile stays, as it did before there were any:
          in a list already grouped under DAIRY it reads as the group's colour,
          not as a claim about the product. */}
      {product.imageUrl ? (
        <ProductThumb uri={product.imageUrl} size={40} radius={Radius.md} />
      ) : (
        <View style={[styles.chosenIcon, { backgroundColor: face.background }]}>
          <Ionicons name={face.icon} size={20} color={face.tint} />
        </View>
      )}

      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{product.name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {/* The unit, and nothing else.
              <p>"3 listing this" was a count of suppliers across the
              marketplace, which tells a supplier in a city of hundreds
              nothing about their own decision. */}
          {product.baseUnit ?? ''}
        </MandiText>
      </View>

      <View style={styles.trailing}>
        {/* How many of their own listings sit under this product.
            <p>"In catalog" was a yes/no from when one product meant one
            listing. Now that a supplier can list a 200 g tub and a 5 kg block
            under the same product, the useful fact is how many they already
            have — and zero of them says "new" without a second word for it. */}
        {skuCount > 0 ? (
          <View style={styles.listedPill}>
            <MandiText variant="caption" color={Colors.success}>
              {skuCount === 1 ? '1 SKU' : `${skuCount} SKUs`}
            </MandiText>
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
      {...radioProps(active)}
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
  pair: { flexDirection: 'row', gap: Spacing.md },
  gallery: { gap: Spacing.sm },
  galleryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  gradeSection: { gap: Spacing.xs },
  discountPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    backgroundColor: '#FFF3E0',
    alignSelf: 'flex-start',
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
});
