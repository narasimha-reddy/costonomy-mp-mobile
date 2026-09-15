import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecommendedOffer } from '@/models/discovery';
import { explanationLabel } from '@/models/explanations';
import { MandiBadge, MandiButton, MandiCard, MandiText } from '@/components/common';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * One supplier's offer, as compared on REST-SUP-01. Doc 05 §8.
 *
 * <p>Shows the commercial figures side by side — pack price, GST, effective
 * total, availability, ETA — and the reasons behind the ranking.
 *
 * <p><b>`effectiveTotal` excludes delivery, and the card says so.</b> The fee is
 * not quoted until a courier is chosen after Ready for Pickup, so showing a
 * number that looked like a delivered cost would be inventing one. An unknown is
 * labelled, never guessed (doc 07 §4).
 */
export function OfferCard({
  offer,
  recommended,
  onAdd,
  adding,
}: {
  offer: RecommendedOffer;
  recommended?: boolean;
  onAdd: () => void;
  adding?: boolean;
}) {
  const unavailable = offer.availability !== 'AVAILABLE';

  return (
    <MandiCard outlined={recommended} accentColor={recommended ? Colors.primary : undefined}>
      {recommended && (
        <MandiBadge label="Recommended" icon="star" style={styles.badge} />
      )}

      <View style={styles.row}>
        <View style={styles.identity}>
          <MandiText variant="bodyEmphasis">{offer.supplierName}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {offer.storeName}
            {offer.distanceKm != null && ` · ${formatQuantity(offer.distanceKm)} km`}
          </MandiText>
        </View>
        <View style={styles.pricing}>
          <MandiText variant="price">{formatMoney(offer.unitPrice)}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            per {formatQuantity(offer.packSize)} {offer.packUnit}
          </MandiText>
        </View>
      </View>

      <View style={styles.figures}>
        <Figure label="Items" value={formatMoney(offer.itemTotal)} />
        <Figure label={`GST ${formatGstRate(offer.gstRate)}`} value={formatMoney(offer.gstAmount)} />
        <Figure label="Total" value={formatMoney(offer.effectiveTotal)} emphasis />
      </View>
      <MandiText variant="caption" color={Colors.textTertiary}>
        Delivery is quoted once a courier is assigned, and is not in this total.
      </MandiText>

      <View style={styles.signals}>
        {offer.etaMinutes != null && (
          <MandiBadge label={`~${offer.etaMinutes} min`} icon="time-outline" />
        )}
        {!offer.coversFullQuantity && (
          <MandiBadge
            label={
              offer.availableQuantity != null
                ? `Only ${formatQuantity(offer.availableQuantity)} available`
                : 'Partial quantity'
            }
            icon="alert-circle-outline"
            color={Colors.warning}
            backgroundColor={Colors.warningLight}
          />
        )}
        {unavailable && (
          <MandiBadge
            label="Out of stock"
            color={Colors.danger}
            backgroundColor={Colors.dangerLight}
          />
        )}
      </View>

      {offer.explanations.length > 0 && (
        <View style={styles.signals}>
          {offer.explanations.map((code) => (
            <MandiBadge key={code} label={explanationLabel(code)} />
          ))}
        </View>
      )}

      <MandiButton
        label={unavailable ? 'Unavailable' : 'Add to cart'}
        onPress={onAdd}
        disabled={unavailable}
        loading={adding}
        variant={recommended ? 'primary' : 'secondary'}
      />
    </MandiCard>
  );
}

function Figure({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.figure}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  identity: { flex: 1, gap: Spacing.xs },
  pricing: { alignItems: 'flex-end' },
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  figure: { gap: Spacing.xs },
  signals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
