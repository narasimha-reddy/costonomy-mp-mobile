import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { quoteDelivery } from '@/services/intent';
import { MandiCard, MandiText } from '@/components/common';
import type { Intent } from '@/models/intent';
import type { DeliveryMode } from '@/models/procurement';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * How the restaurant wants the goods to travel, chosen before they pay. D-091.
 *
 * <p><b>Here rather than after the order.</b> The fee is part of what is
 * charged, so it has to be settled before the payment intent exists — adding
 * delivery afterwards would mean charging twice for one order.
 *
 * <p><b>Every fee is real and shown before the choice is made.</b> Pickup is
 * free, the supplier's own delivery is their configured rate, and ours is a
 * quote taken from the actual distance and weight. None of them is an estimate
 * the restaurant discovers later.
 *
 * <p>The quote's reference is handed up with the choice: creating the order
 * spends it rather than asking again, so the figure on this screen is the figure
 * charged. A quote that has expired comes back as a price change, shown old and
 * new — never silently requoted (§23A.16).
 *
 * <p>A mode the supplier has not offered is not shown. Rendering it disabled
 * would ask the kitchen to work out why the option they want is greyed out.
 */
export function DeliveryModePicker({
  request,
  selected,
  onSelect,
}: {
  request: Intent;
  selected: DeliveryMode | null;
  onSelect: (mode: DeliveryMode, fee: Money, quoteReference?: string) => void;
}) {
  const { accessToken } = useSession();

  const offered = (request.acceptance?.deliveryModes ?? '')
    .split(',')
    .map((mode) => mode.trim())
    .filter(Boolean) as DeliveryMode[];

  // A supplier who declared nothing has not refused anything. Pickup and our
  // delivery always work; only their own van is theirs to offer.
  const available: DeliveryMode[] = offered.length > 0
    ? offered
    : ['PICKUP', 'COSTONOMY_DELIVERY'];

  const quote = useQuery({
    queryKey: ['delivery-quote', request.id],
    queryFn: () => quoteDelivery(accessToken as string, request.id),
    enabled: available.includes('COSTONOMY_DELIVERY') && accessToken != null,
    // Quotes expire. Refetching on focus keeps the screen showing a figure that
    // can still be spent, rather than one that fails at the moment of paying.
    staleTime: 10 * 60_000,
    retry: false,
  });

  const supplierFee = request.acceptance?.deliveryFee ?? '0';

  function feeFor(mode: DeliveryMode): Money | null {
    if (mode === 'PICKUP') return '0';
    if (mode === 'SUPPLIER_DELIVERY') return supplierFee;
    return quote.data?.fee ?? null;
  }

  // Default to the cheapest thing that needs no explanation, once, so the bar
  // below can show a total. Never silently: the choice is rendered selected.
  useEffect(() => {
    const first: DeliveryMode | undefined =
      available.includes('PICKUP') ? 'PICKUP' : available[0];
    if (selected == null && first != null) {
      const fee = feeFor(first);
      if (fee != null) {
        onSelect(first, fee, first === 'COSTONOMY_DELIVERY'
          ? quote.data?.quoteReference : undefined);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, available.length, quote.data?.quoteReference]);

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">How should this reach you?</MandiText>
      <View style={styles.options}>
        {available.map((mode) => {
          const active = selected === mode;
          const fee = feeFor(mode);
          const unavailable = mode === 'COSTONOMY_DELIVERY' && quote.isError;

          return (
            <Pressable
              key={mode}
              disabled={unavailable || fee == null}
              onPress={() => onSelect(mode, fee as Money,
                mode === 'COSTONOMY_DELIVERY' ? quote.data?.quoteReference : undefined)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: unavailable }}
              style={[styles.option, active && styles.optionActive]}
            >
              <View style={styles.flex}>
                <MandiText variant="body">{LABELS[mode]}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {unavailable
                    ? "We can't deliver to this address yet"
                    : mode === 'COSTONOMY_DELIVERY' && quote.isPending
                      ? 'Checking the fee…'
                      : DESCRIPTIONS[mode]}
                </MandiText>
              </View>
              {/* The figure, never a tick alone: §23A.48 forbids meaning carried
                  by colour, and the fee is the thing being decided on anyway. */}
              <MandiText variant="bodyEmphasis">
                {fee == null ? '—' : Number(fee) === 0 ? 'Free' : formatMoney(fee)}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
      {selected === 'COSTONOMY_DELIVERY' && quote.data?.etaMinutes != null ? (
        <MandiText variant="caption" color={Colors.textSecondary}>
          Usually about {quote.data.etaMinutes} minutes once it is picked up
        </MandiText>
      ) : null}
    </MandiCard>
  );
}

const LABELS: Record<DeliveryMode, string> = {
  PICKUP: 'I will collect',
  SUPPLIER_DELIVERY: 'Supplier delivers',
  COSTONOMY_DELIVERY: 'Deliver it for me',
};

const DESCRIPTIONS: Record<DeliveryMode, string> = {
  PICKUP: 'Collect from the store when it is ready',
  SUPPLIER_DELIVERY: 'The supplier brings it in their own vehicle',
  COSTONOMY_DELIVERY: 'We arrange a courier and you can track it',
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  options: { gap: Spacing.sm, marginTop: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionActive: { borderColor: Colors.primary, borderWidth: 2 },
});
