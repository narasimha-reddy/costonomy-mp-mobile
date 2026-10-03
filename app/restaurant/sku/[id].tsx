import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRequestBasket } from '@/hooks/useRequestBasket';
import { useCartQuantity } from '@/hooks/useCartQuantity';
import { fetchSkuDetail } from '@/services/catalog';
import type { SkuDetail } from '@/models/catalog';
import { ProductThumb } from '@/components/product/ProductThumb';
import { CartBar } from '@/components/restaurant/CartBar';
import {
  MandiButton,
  MandiErrorState,
  MandiHeader,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { SubscribeModal } from '@/components/restaurant/SubscribeModal';
import { formatAgeOrMoment } from '@/utils/dateRange';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One pack, in full. D-096.
 *
 * <p>The shelf row and the comparison card answer "which of these is
 * cheapest". This answers the question underneath: what is it, is it the right
 * size, does it fit on the shelf, and did it work for anybody else.
 *
 * <p><b>Every figure is the server's</b>, including the pack price with GST —
 * nothing here multiplies anything (guardrail 3), so this page and the row that
 * led to it cannot come to disagree about what a pack costs.
 */
export default function SkuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const skuId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { drafts } = useRequestBasket();
  const { packsFor, queueChange, lineTotalFor } = useCartQuantity(drafts);

  const query = useQuery({
    queryKey: ['sku', skuId, outletId],
    queryFn: () => fetchSkuDetail(accessToken as string, skuId, outletId ?? undefined),
    enabled: Number.isFinite(skuId) && accessToken != null,
  });

  const sku = query.data;
  const draft = drafts.find((entry) => entry.supplierStoreId === sku?.supplierStoreId);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  return (
    <MandiScreen
      header={<MandiHeader title={sku?.skuName ?? 'Product'} subtitle={sku?.storeName ?? undefined} back />}
      footer={
        <CartBar
          count={draft?.items.length ?? 0}
          total={draft?.agreedTotal}
          onPress={() => router.push('/restaurant/cart')}
        />
      }
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error || sku == null ? (
        <MandiErrorState message="Couldn't load this product." onRetry={() => query.refetch()} />
      ) : (
        <>
          <Gallery sku={sku} />

          <View style={styles.block}>
            <MandiText variant="title" numberOfLines={3}>{sku.skuName}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {[
                sku.brandName,
                `${formatQuantity(sku.packSize)} ${sku.packUnit}`,
                sku.measureValue != null
                  ? `${formatQuantity(sku.measureValue)} ${sku.measureUnit}` : null,
              ].filter(Boolean).join(' · ')}
            </MandiText>

            {/* The price with GST, as the cart will charge it, and the rate
                named beneath rather than left to be inferred. */}
            {sku.unitPriceInclusiveGst != null && (
              <View style={styles.priceRow}>
                <MandiText variant="priceLarge">
                  {formatMoney(sku.unitPriceInclusiveGst)}
                </MandiText>
                {sku.gstRate != null && (
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    per pack · inc. {formatGstRate(sku.gstRate)} GST
                  </MandiText>
                )}
              </View>
            )}

            {sku.availability !== 'AVAILABLE' ? (
              <View style={[styles.pill, styles.outPill]}>
                <Ionicons name="close-circle" size={14} color={Colors.danger} />
                <MandiText variant="caption" color={Colors.danger}>Out of stock</MandiText>
              </View>
            ) : (
              <View style={styles.stepper}>
                <MandiQuantityStepper
                  value={packsFor(sku.supplierSkuId)}
                  onChange={(packs) => queueChange(sku.supplierSkuId, packs)}
                  min={0}
                  unit={sku.packUnit}
                  itemLabel={sku.skuName}
                />
                {lineTotalFor(sku.supplierSkuId) != null && (
                  <MandiText variant="price">
                    {formatMoney(lineTotalFor(sku.supplierSkuId) as string)}
                  </MandiText>
                )}
                <MandiButton
                  label="Subscribe Daily"
                  size="sm"
                  variant="secondary"
                  onPress={() => setSubscribeOpen(true)}
                />
              </View>
            )}
          </View>

          <Seller sku={sku} onPress={() =>
            router.push(`/restaurant/supplier/${sku.supplierStoreId}`)} />

          {sku.description != null && (
            <Section title="About this product">
              <MandiText variant="body" color={Colors.textSecondary}>
                {sku.description}
              </MandiText>
            </Section>
          )}

          <Dimensions sku={sku} />

          {sku.youtubeUrl != null && (
            <Section title="Video">
              {/* A link out rather than an embed. The app has no player, and a
                  web view for one video is a dependency and a privacy surface
                  for something the phone already does well. */}
              <Pressable
                onPress={() => void Linking.openURL(sku.youtubeUrl as string)}
                accessibilityRole="link"
                accessibilityLabel="Watch this product on YouTube"
                style={({ pressed }) => [styles.video, pressed && styles.pressed]}
              >
                <Ionicons name="logo-youtube" size={22} color={Colors.danger} />
                <MandiText variant="body" style={styles.flex}>Watch on YouTube</MandiText>
                <Ionicons name="open-outline" size={16} color={Colors.textTertiary} />
              </Pressable>
            </Section>
          )}

          <OtherPacks sku={sku} />
          <Reviews sku={sku} />

          <SubscribeModal
            visible={subscribeOpen}
            onClose={() => setSubscribeOpen(false)}
            supplierStoreId={sku.supplierStoreId}
            supplierSkuId={sku.supplierSkuId}
            productName={sku.skuName}
            defaultUnit={sku.packUnit}
          />
        </>
      )}
    </MandiScreen>
  );
}

/**
 * The pictures.
 *
 * <p>The thumbnail leads, then the gallery. A supplier who uploaded nothing
 * gets the canonical product's picture and no rail — one image in a carousel
 * reads as a carousel that failed to load the rest.
 */
function Gallery({ sku }: { sku: SkuDetail }) {
  const all = [sku.imageUrl, ...sku.images].filter(Boolean) as string[];
  const [shown, setShown] = useState(0);

  if (all.length === 0) {
    return null;
  }

  return (
    <View style={styles.gallery}>
      <ProductThumb uri={all[shown]} size={260} radius={Radius.lg} />
      {all.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {all.map((url, index) => (
            <Pressable
              key={`${url}-${index}`}
              onPress={() => setShown(index)}
              accessibilityRole="button"
              accessibilityLabel={`Picture ${index + 1} of ${all.length}`}
              accessibilityState={{ selected: index === shown }}
              style={[styles.thumb, index === shown && styles.thumbActive]}
            >
              <ProductThumb uri={url} size={52} radius={Radius.sm} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Seller({ sku, onPress }: { sku: SkuDetail; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`See everything ${sku.storeName} sells`}
      style={({ pressed }) => [styles.seller, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{sku.storeName}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {[
            sku.supplierName,
            sku.distanceKm != null ? `${formatQuantity(sku.distanceKm)} km` : null,
            sku.etaMinutes != null ? `${sku.etaMinutes} min` : null,
          ].filter(Boolean).join(' · ')}
        </MandiText>
        {/* The store's rating, named as the store's — it is not this pack's,
            and the two are separate scores on this page for a reason. */}
        {sku.storeRatingCount > 0 && sku.storeRating != null && (
          <View style={styles.inlineRating}>
            <Ionicons name="star" size={12} color={Colors.warning} />
            <MandiText variant="caption" color={Colors.textSecondary}>
              {formatQuantity(sku.storeRating)} supplier rating ({sku.storeRatingCount})
            </MandiText>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

/**
 * How big the pack is.
 *
 * <p>Only the numbers the supplier gave. A missing measurement is left out
 * rather than shown as a dash: a kitchen checking whether a sack fits a shelf
 * needs to know the answer is absent, not that it is zero.
 */
function Dimensions({ sku }: { sku: SkuDetail }) {
  const size = [sku.lengthCm, sku.widthCm, sku.heightCm];
  const hasSize = size.every((value) => value != null);
  if (!hasSize && sku.weightGrams == null) {
    return null;
  }

  return (
    <Section title="Pack size">
      {hasSize && (
        <Row
          label="Dimensions"
          value={`${size.map((value) => formatQuantity(value as string)).join(' × ')} cm`}
        />
      )}
      {sku.weightGrams != null && (
        <Row label="Weight" value={`${formatQuantity(sku.weightGrams)} g`} />
      )}
    </Section>
  );
}

/**
 * The rest of this supplier's range for the same product.
 *
 * <p>The comparison shows one card per supplier, so without this a store that
 * lists a 200 g tub beside a 5 kg block has effectively hidden one of them.
 */
function OtherPacks({ sku }: { sku: SkuDetail }) {
  const router = useRouter();
  const brandOptions = sku.brandOptions ?? [];
  const hasBrandOptions = brandOptions.length > 1;

  if (hasBrandOptions) {
    return (
      <Section
        title={`Brand Options from ${sku.storeName}`}
        trailing={
          <MandiText variant="caption" color={Colors.textTertiary}>
            Lowest price first
          </MandiText>
        }
      >
        {brandOptions.map((opt, idx) => {
          const isCurrent = opt.supplierSkuId === sku.supplierSkuId;
          const isLowest = idx === 0;
          const priceDisplay = opt.unitPriceInclusiveGst != null
            ? formatMoney(opt.unitPriceInclusiveGst)
            : formatMoney(opt.sellingPrice);

          return (
            <Pressable
              key={opt.supplierSkuId}
              onPress={() => {
                if (!isCurrent) {
                  router.push(`/restaurant/sku/${opt.supplierSkuId}`);
                }
              }}
              disabled={isCurrent}
              accessibilityRole="button"
              accessibilityLabel={`${opt.brandName || opt.skuName}, ${formatQuantity(opt.packSize)} ${opt.packUnit}`}
              style={({ pressed }) => [
                styles.pack,
                isCurrent && styles.packCurrent,
                pressed && !isCurrent && styles.pressed,
              ]}
            >
              <ProductThumb uri={opt.imageUrl} size={40} radius={Radius.sm} />
              <View style={styles.flex}>
                <View style={styles.packTitleRow}>
                  <MandiText variant="bodyEmphasis" numberOfLines={1}>
                    {opt.brandName || opt.skuName}
                  </MandiText>
                  {isLowest && (
                    <View style={styles.lowestBadge}>
                      <MandiText variant="caption" style={styles.lowestBadgeText}>
                        Lowest Price
                      </MandiText>
                    </View>
                  )}
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <MandiText variant="caption" style={styles.currentBadgeText}>
                        Viewing
                      </MandiText>
                    </View>
                  )}
                </View>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {[
                    opt.skuName !== (opt.brandName || opt.skuName) ? opt.skuName : null,
                    `${formatQuantity(opt.packSize)} ${opt.packUnit.toLowerCase()}`,
                    opt.availability !== 'AVAILABLE' ? 'Out of stock' : null,
                  ].filter(Boolean).join(' · ')}
                </MandiText>
              </View>
              <View style={styles.packPriceCol}>
                <MandiText variant="bodyEmphasis">{priceDisplay}</MandiText>
                {opt.gstRate != null && Number(opt.gstRate) > 0 && (
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    Inc. GST
                  </MandiText>
                )}
              </View>
              {!isCurrent && (
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              )}
            </Pressable>
          );
        })}
      </Section>
    );
  }

  if (sku.otherPacks.length === 0) {
    return null;
  }

  return (
    <Section title={`Other packs from ${sku.storeName}`}>
      {sku.otherPacks.map((pack) => (
        <Pressable
          key={pack.supplierSkuId}
          onPress={() => router.push(`/restaurant/sku/${pack.supplierSkuId}`)}
          accessibilityRole="button"
          accessibilityLabel={`${pack.skuName}, ${formatQuantity(pack.packSize)} ${pack.packUnit}`}
          style={({ pressed }) => [styles.pack, pressed && styles.pressed]}
        >
          <ProductThumb uri={pack.imageUrl} size={40} radius={Radius.sm} />
          <View style={styles.flex}>
            <MandiText variant="body" numberOfLines={1}>{pack.skuName}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {[
                pack.brandName,
                `${formatQuantity(pack.packSize)} ${pack.packUnit}`,
                pack.availability !== 'AVAILABLE' ? 'Out of stock' : null,
              ].filter(Boolean).join(' · ')}
            </MandiText>
          </View>
          {pack.sellingPrice != null && (
            <MandiText variant="bodyEmphasis">
              {formatMoney(pack.unitPriceInclusiveGst ?? pack.sellingPrice)}
            </MandiText>
          )}
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </Pressable>
      ))}
    </Section>
  );
}

/**
 * What other kitchens made of it.
 *
 * <p>Every review here came from an order that completed — the server will not
 * store one otherwise — which is what makes them worth reading. A pack nobody
 * has reviewed says so rather than showing an empty score.
 */
function Reviews({ sku }: { sku: SkuDetail }) {
  return (
    <Section
      title="Reviews"
      trailing={sku.averageRating != null ? (
        <View style={styles.inlineRating}>
          <Ionicons name="star" size={14} color={Colors.warning} />
          <MandiText variant="bodyEmphasis">{formatQuantity(sku.averageRating)}</MandiText>
          <MandiText variant="caption" color={Colors.textTertiary}>
            ({sku.reviewCount})
          </MandiText>
        </View>
      ) : undefined}
    >
      {sku.reviews.length === 0 ? (
        <MandiText variant="caption" color={Colors.textTertiary}>
          Nobody has reviewed this pack yet. Reviews come from kitchens who received it.
        </MandiText>
      ) : (
        sku.reviews.map((review) => (
          <View key={review.id} style={styles.review}>
            <View style={styles.reviewTop}>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= review.rating ? 'star' : 'star-outline'}
                    size={12}
                    color={star <= review.rating ? Colors.warning : Colors.textTertiary}
                  />
                ))}
              </View>
              <MandiText variant="caption" color={Colors.textTertiary} style={styles.flex}>
                {review.outletName ?? 'A kitchen'}
              </MandiText>
              <MandiText variant="caption" color={Colors.textTertiary}>
                {formatAgeOrMoment(review.createdAt)}
              </MandiText>
            </View>
            {review.comment != null && (
              <MandiText variant="body" color={Colors.textSecondary}>{review.comment}</MandiText>
            )}
          </View>
        ))
      )}
    </Section>
  );
}

function Section({ title, trailing, children }: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.sectionHead}>
        <MandiText variant="bodyEmphasis" accessibilityRole="header" style={styles.flex}>
          {title}
        </MandiText>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>{label}</MandiText>
      <MandiText variant="body">{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  gallery: { alignItems: 'center', gap: Spacing.md },
  rail: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  thumb: { borderRadius: Radius.sm, borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: Colors.primary },
  block: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  outPill: { backgroundColor: Colors.dangerLight },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  inlineRating: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  video: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  packCurrent: {
    backgroundColor: '#F1F8E9',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
  },
  packTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  packPriceCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  lowestBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#4CAF50',
  },
  lowestBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2E7D32',
  },
  currentBadge: {
    backgroundColor: Colors.surfaceSunken,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  review: {
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stars: { flexDirection: 'row', alignItems: 'center' },
});
