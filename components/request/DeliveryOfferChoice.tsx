import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiCard, MandiFormField, MandiText } from '@/components/common';
import type { DeliveryPolicy } from '@/services/supplier';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';
import { radioProps } from '@/lib/a11y';

export type DeliveryOffer = 'SELF_FREE' | 'SELF' | 'COSTONOMY' | 'NONE';

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
  // "I will deliver it" is the supplier's own call and needs no setting. What they charge is theirs to enter for each
  // order: zero is free delivery.
  const offers: DeliveryOffer[] = ['SELF'];
  if (policy.costonomyDeliveryEnabled) offers.push('COSTONOMY');
  // Not every request can be delivered: saying so leaves the restaurant to collect it, or go elsewhere.
  offers.push('NONE');
  return offers;
}

/** The charge typed for delivery: empty means 0 (free); anything else must be a plain non-negative number. */
export function deliveryChargeValid(fee: string | undefined): boolean {
  const text = (fee ?? '').trim();
  return text === '' || (/^\d*\.?\d*$/.test(text) && text !== '.' && Number.isFinite(Number(text)));
}

/**
 * What to send for the supplier's choice. Delivering themselves with a charge of 0 (or nothing typed) is free
 * delivery; any other amount is the charge the restaurant is shown. The server checks the amount again.
 */
export function deliveryAnswerFor(
  offer: DeliveryOffer | null,
  charge: string,
): { deliveryOffer?: DeliveryOffer; deliveryFee?: string } {
  if (offer == null) return {};
  if (offer !== 'SELF') return { deliveryOffer: offer };
  const amount = Number(charge.trim() === '' ? '0' : charge);
  return amount === 0
    ? { deliveryOffer: 'SELF_FREE' }
    : { deliveryOffer: 'SELF', deliveryFee: String(amount) };
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
      title: 'I will deliver it',
      detail: 'You handle the delivery yourself.',
    },
    SELF: {
      title: 'I will deliver it',
      detail: 'You handle the delivery yourself. Enter what you charge the restaurant, or 0 for free delivery.',
    },
    NONE: {
      title: "I can't deliver this order",
      detail: 'The restaurant can collect it instead.',
    },
    COSTONOMY: {
      title: 'Use Costonomy delivery',
      detail: 'Delivery partners are requested after you mark the order Ready for Pickup. The restaurant pays the delivery fee.',
    },
  };

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">How will this be delivered?</MandiText>
      <View style={styles.options}>
        {offers.map((offer) => {
          const active = value === offer;
          return (
            <View key={offer} style={styles.optionGroup}>
              <Pressable
                onPress={() => onChange(offer)}
                accessibilityRole="radio"
                {...radioProps(active)}
                style={[styles.option, active && styles.optionActive]}
              >
                <MandiText variant="body">{labels[offer].title}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {labels[offer].detail}
                </MandiText>
              </Pressable>
              {/* The charge belongs to this option, so it sits right under it and not under the last one. */}
              {offer === 'SELF' && active && onFeeChange != null && (
                <View style={styles.fee}>
                  <MandiFormField
                    label="Delivery charge for this order (₹)"
                    value={fee ?? ''}
                    onChangeText={(text) => onFeeChange(text.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                  <MandiText variant="caption" color={deliveryChargeValid(fee) && Number(fee || '0') === 0 ? Colors.success : Colors.textSecondary}>
                    {!deliveryChargeValid(fee)
                      ? 'Enter a number, such as 0 or 40.'
                      : Number(fee || '0') === 0
                        ? 'Free delivery. The restaurant is told it is free.'
                        : `The restaurant sees ${formatMoney(String(Number(fee)))} for delivery before they order.`}
                  </MandiText>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  options: { gap: Spacing.sm, marginTop: Spacing.sm },
  optionGroup: { gap: Spacing.sm },
  fee: { gap: Spacing.xs, paddingHorizontal: Spacing.md },
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
