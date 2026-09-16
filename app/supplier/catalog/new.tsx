import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { useDebounced } from '@/hooks/useDebounced';
import { searchProducts } from '@/services/catalog';
import { createSku } from '@/services/supplier';
import { categoryFace } from '@/models/categories';
import type { Product } from '@/models/catalog';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
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
import { Colors, Elevation, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-CATALOG-02';
const STEPS = ['Find the product', 'Pack and price'];
const UNITS = ['KG', 'L', 'PIECE', 'DOZEN', 'BOX'];
const GST_RATES = ['0', '5', '12', '18'];

/**
 * SUP-CATALOG-02. Doc 05 §29.
 *
 * <p><b>You pick a platform product, you do not invent one.</b> A SKU is tied to
 * a canonical product, and that link is what puts this listing into a
 * restaurant's comparison against every other supplier. A free-text product name
 * would list something nobody could ever find — which is why the server requires
 * the id and there is deliberately no API for a supplier to create a canonical
 * product (doc 01 §7).
 *
 * <p>So step one is search, not a text box. What you call it is step two, and
 * defaults to the platform's name because most of the time that is right.
 */
export default function NewSkuScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [step, setStep] = useState(0);
  const [term, setTerm] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [packSize, setPackSize] = useState('1');
  const [packUnit, setPackUnit] = useState('KG');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState('5');

  const settled = useDebounced(term, 250);
  const searching = settled.trim().length >= 2;

  const results = useQuery({
    queryKey: ['search', 'products', settled.trim()],
    queryFn: ({ signal }) => searchProducts(accessToken as string, settled.trim(), signal),
    enabled: searching && accessToken != null,
  });

  function pick(chosen: Product) {
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
      // history behind it, and `back` would then do nothing at all — leaving the
      // supplier on a form whose product they have just created.
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
          title="List a product"
          back
          onBack={() => (step === 0 ? router.back() : setStep(0))}
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
            <MandiText variant="display">What are you selling?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              Pick it from the platform catalog so restaurants can compare your price
              against other suppliers.
            </MandiText>
          </View>

          <MandiSearchBar
            value={term}
            onChangeText={setTerm}
            placeholder="Paneer, basmati rice, sunflower oil…"
          />

          {!searching ? (
            <MandiEmptyState
              compact
              icon="search-outline"
              title="Start typing"
              description="Two letters is enough."
            />
          ) : results.isPending ? (
            <MandiSkeletonList count={4} />
          ) : (results.data ?? []).length === 0 ? (
            <MandiEmptyState
              icon="help-circle-outline"
              title={`Nothing called "${settled.trim()}"`}
              description="Try the common name for it. If it genuinely isn't listed, tell us and we'll add it to the catalog."
            />
          ) : (
            (results.data ?? []).map((item) => (
              <ProductRow key={item.id} product={item} onPress={() => pick(item)} />
            ))
          )}
        </>
      )}

      {step === 1 && product != null && (
        <>
          <MandiCard>
            <View style={styles.chosen}>
              <View
                style={[styles.chosenIcon, { backgroundColor: categoryFace(product.categoryName).background }]}
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
                  {product.offerCount ? ` · ${product.offerCount} suppliers already listing this` : ''}
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

function ProductRow({ product, onPress }: { product: Product; onPress: () => void }) {
  const face = categoryFace(product.categoryName);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`List ${product.name}`}
      style={({ pressed }) => [styles.productRow, pressed && styles.pressed]}
    >
      <View style={[styles.chosenIcon, { backgroundColor: face.background }]}>
        <Ionicons name={face.icon} size={20} color={face.tint} />
      </View>
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{product.name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {[product.categoryName, product.baseUnit && `sold per ${product.baseUnit}`]
            .filter(Boolean).join(' · ')}
        </MandiText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
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
