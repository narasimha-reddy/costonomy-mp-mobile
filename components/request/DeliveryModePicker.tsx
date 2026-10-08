import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { quoteDelivery } from '@/services/intent';
import { deliveryUnavailableMessage } from '@/lib/delivery/quoteMessages';
import { MandiButton, MandiCard, MandiText } from '@/components/common';
import type { Intent } from '@/models/intent';
import type { DeliveryMode } from '@/models/procurement';
import { formatMoney, type Money } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';
import { radioState } from '@/lib/a11y';

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
  initialMode = null,
  onQuoteBusy,
}: {
  request: Intent;
  selected: DeliveryMode | null;
  /** A choice made on an earlier visit to this request; it wins over the defaults below when still offered. */
  initialMode?: DeliveryMode | null;
  onSelect: (mode: DeliveryMode, fee: Money, quoteReference?: string) => void;
  /** True while Costonomy delivery is chosen and its quote is being asked for again: the fee held above is then out of date. */
  onQuoteBusy?: (busy: boolean) => void;
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
    // A quote kept from an earlier visit may have expired, and a restored choice would spend it: ask again on open.
    // This costs one quote call (which may reach a courier's API) every time the screen opens; that is the price of
    // never sending a reference the server has already expired.
    refetchOnMount: 'always',
    retry: false,
  });

  // The reference the parent was last given, so a refetch that returns a different one can be passed up.
  const emitted = useRef<string | undefined>(undefined);
  const emit = (mode: DeliveryMode, fee: Money, quoteReference?: string) => {
    emitted.current = mode === 'COSTONOMY_DELIVERY' ? quoteReference : undefined;
    onSelect(mode, fee, quoteReference);
  };

  const supplierFee = request.acceptance?.deliveryFee ?? '0';

  function feeFor(mode: DeliveryMode): Money | null {
    if (mode === 'PICKUP') return '0';
    if (mode === 'SUPPLIER_DELIVERY') return supplierFee;
    // No figure while a new quote is on its way or the last ask failed: the old one may be the very quote the server
    // just refused, and choosing from it would send that reference again.
    if (quote.isFetching || quote.isError) return null;
    return quote.data?.fee ?? null;
  }

  // Default to the cheapest thing that needs no explanation, once, so the bar
  // below can show a total. Never silently: the choice is rendered selected.
  useEffect(() => {
    // Where it starts, in order: a choice the restaurant already made here; the supplier's own delivery when they
    // proposed it (shown selected with its fee, pickup one tap away); Costonomy delivery when the restaurant asked
    // for delivery in the cart and it is offered (its quoted fee shown on the option); otherwise pickup.
    // Never pickup by silence: a delivery request whose quote has not arrived waits for it (or for a tap).
    const offeredOwn = available.includes('SUPPLIER_DELIVERY')
      && (request.acceptance?.deliveryOffer === 'SELF_FREE' || request.acceptance?.deliveryOffer === 'SELF');
    const wantsDelivery = request.deliveryPreference === 'DELIVERY' && available.includes('COSTONOMY_DELIVERY');
    const first: DeliveryMode | undefined = initialMode != null && available.includes(initialMode)
      ? initialMode
      : offeredOwn
        ? 'SUPPLIER_DELIVERY'
        : wantsDelivery
          ? 'COSTONOMY_DELIVERY'
          : available.includes('PICKUP') ? 'PICKUP' : available[0];
    if (selected == null && first != null) {
      const fee = feeFor(first);
      if (fee != null) {
        emit(first, fee, first === 'COSTONOMY_DELIVERY'
          ? quote.data?.quoteReference : undefined);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, available.length, quote.data?.quoteReference, quote.isFetching, quote.isError]);

  // A refetch (the screen was left open past staleTime and refocused) can return a new fee and reference while
  // Costonomy is already chosen. The parent would keep the old pair, so the fee shown and the reference sent would
  // differ: hand it the new pair as soon as it arrives.
  useEffect(() => {
    if (selected !== 'COSTONOMY_DELIVERY' || quote.isFetching || quote.isError || quote.data == null) return;
    if (emitted.current !== quote.data.quoteReference) {
      emit('COSTONOMY_DELIVERY', quote.data.fee, quote.data.quoteReference);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, quote.data?.quoteReference, quote.isFetching, quote.isError]);

  const quoteBusy = selected === 'COSTONOMY_DELIVERY' && quote.isFetching;
  useEffect(() => {
    onQuoteBusy?.(quoteBusy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteBusy]);

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">How should this reach you?</MandiText>
      {request.deliveryPreference === 'DELIVERY' && request.acceptance?.deliveryOffer === 'NONE' && (
        <MandiText variant="caption" color={Colors.textSecondary}>
          This supplier can&apos;t deliver this order, so you would collect it.
        </MandiText>
      )}
      <View style={styles.options}>
        {available.map((mode) => {
          const active = selected === mode;
          const fee = feeFor(mode);
          const unavailable = mode === 'COSTONOMY_DELIVERY' && quote.isError;

          return (
            <Pressable
              key={mode}
              disabled={unavailable || fee == null}
              onPress={() => emit(mode, fee as Money,
                mode === 'COSTONOMY_DELIVERY' ? quote.data?.quoteReference : undefined)}
              accessibilityRole="radio"
              accessibilityState={radioState(active, unavailable)}
              style={[styles.option, active && styles.optionActive]}
            >
              <View style={styles.flex}>
                <MandiText variant="body">{LABELS[mode]}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {unavailable
                    ? deliveryUnavailableMessage(quote.error)
                    : mode === 'COSTONOMY_DELIVERY' && quote.isPending
                      ? 'Checking the fee…'
                      : mode === 'SUPPLIER_DELIVERY' && request.acceptance?.deliveryOffer != null && fee != null && Number(fee) === 0
                        ? 'Free delivery by the supplier, in their own vehicle'
                        : DESCRIPTIONS[mode]}
                </MandiText>
                {mode === 'SUPPLIER_DELIVERY' && request.acceptance?.highDeliveryCharge === true && fee != null && (
                  <MandiText variant="captionEmphasis" color={Colors.warning}>
                    High delivery charge: {formatMoney(fee)} on this order. You can collect it instead.
                  </MandiText>
                )}
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
      {quote.isError && available.includes('COSTONOMY_DELIVERY') ? (
        <MandiButton label="Try again" variant="tertiary" onPress={() => void quote.refetch()} />
      ) : null}
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
