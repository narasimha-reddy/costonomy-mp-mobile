import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiCard, MandiFormField, MandiText } from '@/components/common';
import type { DeliveryPolicy } from '@/services/supplier';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

export type DeliveryOffer = 'SELF_FREE' | 'SELF' | 'COSTONOMY';

/**
 * What the supplier will do about delivery, chosen when they accept (API D-141).
 *
 * <p>Only what the store's delivery settings allow. Free delivery is a choice
 * the supplier makes here and the restaurant then sees stated plainly; Costonomy
 * riders are requested once the order is marked Ready for Pickup, and the buyer
 * pays their fee. Pickup is always available, so it is not listed.
 */
export function deliveryOffersFor(policy: DeliveryPolicy | undefined): DeliveryOffer[] {
  if (policy == null) return [];
  // "I will deliver this one" is the supplier's own call and needs no setting. Charging for it is limited by the
  // store's own delivery fee, so that option is there only when a fee is set.
  const offers: DeliveryOffer[] = ['SELF_FREE'];
  if (policy.ownDeliveryFee != null && Number(policy.ownDeliveryFee) > 0) offers.push('SELF');
  if (policy.costonomyDeliveryEnabled) offers.push('COSTONOMY');
  return offers;
}

export function DeliveryOfferChoice({
  policy,
  value,
  onChange,
  fee,
  onFeeChange,
}: {
  policy: DeliveryPolicy;
  value: DeliveryOffer | null;
  onChange: (offer: DeliveryOffer) => void;
  /** What to charge for this request when delivering at a fee; empty means the store's fee. */
  fee?: string;
  onFeeChange?: (fee: string) => void;
}) {
  const offers = deliveryOffersFor(policy);
  if (offers.length === 0) return null;

  const labels: Record<DeliveryOffer, { title: string; detail: string }> = {
    SELF_FREE: {
      title: 'I will deliver it — free',
      detail: 'You handle the delivery yourself, at no charge to the restaurant. They are told it is free.',
    },
    SELF: {
      title: `I will deliver it — ${formatMoney(policy.ownDeliveryFee ?? '0')}`,
      detail: 'Charged to the restaurant. Keep your store fee, or enter a lower amount for this order.',
    },
    COSTONOMY: {
      title: 'Use Costonomy delivery',
      detail: 'Riders are requested after you mark the order Ready for Pickup. The restaurant pays the delivery fee.',
    },
  };

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">How will this be delivered?</MandiText>
      <View style={styles.options}>
        {offers.map((offer) => {
          const active = value === offer;
          return (
            <Pressable
              key={offer}
              onPress={() => onChange(offer)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.option, active && styles.optionActive]}
            >
              <MandiText variant="body">{labels[offer].title}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {labels[offer].detail}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
      {value === 'SELF' && onFeeChange != null && (
        <MandiFormField
          label={`Delivery charge for this order (up to ${formatMoney(policy.ownDeliveryFee ?? '0')})`}
          value={fee ?? ''}
          onChangeText={onFeeChange}
          keyboardType="decimal-pad"
          placeholder={String(policy.ownDeliveryFee ?? '0')}
        />
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  options: { gap: Spacing.sm, marginTop: Spacing.sm },
  option: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionActive: { borderColor: Colors.primary, borderWidth: 2 },
});
