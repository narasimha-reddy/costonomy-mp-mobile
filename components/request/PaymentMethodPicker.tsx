import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchWallet } from '@/services/wallet';
import { fetchOutletAgreements } from '@/services/credit';
import { MandiCard, MandiText } from '@/components/common';
import { formatMoney, type Money } from '@/utils/money';
import { PAYMENT_METHOD_LABEL } from '@/components/request/paymentLabels';
import { Colors, Radius, Spacing } from '@/theme';
import { radioState } from '@/lib/a11y';

export type PaymentMethod = 'PREPAID' | 'WALLET' | 'CREDIT';

/**
 * How the restaurant wants to pay, chosen before the order exists.
 *
 * <p><b>Every option says whether it can actually cover this order</b>, and one
 * that cannot is shown disabled with the reason rather than hidden. A method
 * that vanishes leaves a kitchen wondering where it went; one that fails at the
 * moment of ordering wastes the window they were racing.
 *
 * <p>The three differ in when money moves, which is why they are not
 * interchangeable:
 *
 * <ul>
 *   <li><b>Card</b> authorises afterwards, on a screen that can be declined.</li>
 *   <li><b>Wallet</b> settles inside the order's own creation — the money is
 *       already the restaurant's, so there is nothing to complete.</li>
 *   <li><b>Credit</b> reserves against the supplier's terms, likewise inside
 *       the creation, and is owed rather than paid.</li>
 * </ul>
 *
 * <p>Balances come from the server on every open. A cached figure is the one
 * that says a wallet can cover an order it no longer can.
 */
export function PaymentMethodPicker({
  outletId,
  supplierStoreId,
  amount,
  selected,
  onSelect,
  offered,
  autoSelect = true,
  initialMethod = null,
  title = 'How would you like to pay?',
}: {
  outletId: number | null;
  supplierStoreId: number;
  /** What this order comes to, carriage included. */
  amount: Money | null | undefined;
  selected: PaymentMethod | null;
  /** `null` when the method chosen no longer covers the order and nothing else is usable. */
  onSelect: (method: PaymentMethod | null) => void;
  /** Only these methods are listed. All three by default; the pay screen offers wallet and credit (API D-152). */
  offered?: PaymentMethod[];
  /** Pick the first usable method on open. Off where choosing is a deliberate act. */
  autoSelect?: boolean;
  /**
   * A method chosen on an earlier visit. Taken up only once its balance has loaded and it can still cover this order;
   * until then nothing is selected, so an order cannot go out on a method nobody has checked. If it cannot, the
   * first usable method is chosen as if there had been no earlier choice.
   */
  initialMethod?: PaymentMethod | null;
  title?: string;
}) {
  const { accessToken } = useSession();
  const due = amount == null ? null : Number(amount);

  const wallet = useQuery({
    queryKey: ['outlet', outletId, 'wallet'],
    queryFn: () => fetchWallet(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const agreements = useQuery({
    queryKey: ['outlet', outletId, 'credit-agreements'],
    queryFn: () => fetchOutletAgreements(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  // The terms with *this* supplier. Credit is per supplier, so another
  // supplier's line says nothing about whether this order can be put on account.
  const line = (agreements.data ?? []).find(
    (agreement) => agreement.supplierStoreId === supplierStoreId
      && agreement.status === 'ACTIVE',
  );

  // A query that is switched off (no outlet yet) is pending for ever: that is not "checking".
  const walletPending = wallet.isPending && wallet.fetchStatus !== 'idle';
  const creditPending = agreements.isPending && agreements.fetchStatus !== 'idle';

  const walletBalance = wallet.data?.balance ?? null;
  const walletShort = due != null && walletBalance != null && Number(walletBalance) < due;
  const creditAvailable = line?.available ?? null;
  const creditShort = due != null && creditAvailable != null && Number(creditAvailable) < due;

  const allOptions: {
    key: PaymentMethod;
    label: string;
    hint: string;
    trailing: string | null;
    disabled: boolean;
    pending?: boolean;
  }[] = [
    {
      key: 'PREPAID',
      label: PAYMENT_METHOD_LABEL.PREPAID,
      hint: 'Authorise on the next screen',
      trailing: null,
      disabled: false,
    },
    {
      key: 'WALLET',
      label: PAYMENT_METHOD_LABEL.WALLET,
      hint: walletPending
        ? 'Checking your balance…'
        : walletShort ? 'Not enough for this order' : 'Settles straight away',
      // "available", so a balance is not read as the price of paying this way.
      trailing: walletBalance == null ? null : `${formatMoney(walletBalance)} available`,
      disabled: walletPending || walletBalance == null || walletShort,
      pending: walletPending,
    },
    {
      key: 'CREDIT',
      label: PAYMENT_METHOD_LABEL.CREDIT,
      hint: creditPending
        ? 'Checking your terms…'
        : line == null ? 'No credit with this supplier yet'
          : creditShort ? 'Not enough credit left' : 'Owed, not paid now',
      trailing: creditAvailable == null ? null : `${formatMoney(creditAvailable)} available`,
      disabled: creditPending || line == null || creditShort,
      pending: creditPending,
    },
  ];

  const options = offered == null ? allOptions : allOptions.filter((option) => offered.includes(option.key));

  // Default to the first thing that works, once. Never silently: whatever is
  // chosen is rendered as chosen.
  //
  // And never keep a choice that has stopped working: the total moves (the delivery fee arrives, a quote is
  // replaced) after a method was picked, and a wallet or credit line that covered the old figure may not cover
  // the new one. The method is swapped for the first usable one, or cleared, so it cannot be sent.
  useEffect(() => {
    if (selected != null) {
      const current = options.find((option) => option.key === selected);
      if (current != null && current.disabled && !current.pending) {
        onSelect(options.find((option) => !option.disabled)?.key ?? null);
      }
      return;
    }
    if (!autoSelect) return;
    const earlier = initialMethod == null ? undefined : options.find((option) => option.key === initialMethod);
    // The earlier choice waits for the figure it depends on, then stands or gives way to the first usable method.
    if (earlier?.pending) return;
    const usable = earlier != null && !earlier.disabled ? earlier : options.find((option) => !option.disabled);
    if (usable != null) onSelect(usable.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, walletPending, creditPending, walletShort, creditShort, line == null]);

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">{title}</MandiText>
      <View style={styles.options}>
        {options.map((option) => {
          const active = selected === option.key;
          return (
            <Pressable
              key={option.key}
              disabled={option.disabled}
              onPress={() => onSelect(option.key)}
              accessibilityRole="radio"
              accessibilityState={radioState(active, option.disabled)}
              style={[
                styles.option,
                active && styles.optionActive,
                option.disabled && styles.optionDisabled,
              ]}
            >
              <View style={styles.flex}>
                <MandiText
                  variant="body"
                  color={option.disabled ? Colors.textTertiary : Colors.textPrimary}
                >
                  {option.label}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {option.hint}
                </MandiText>
              </View>
              {/* The figure, not a tick: §23A.48 forbids meaning carried by
                  colour alone, and the balance is what the choice turns on. */}
              {option.trailing != null && (
                <MandiText
                  variant="captionEmphasis"
                  color={option.disabled ? Colors.textTertiary : Colors.textPrimary}
                >
                  {option.trailing}
                </MandiText>
              )}
            </Pressable>
          );
        })}
      </View>
    </MandiCard>
  );
}

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
  optionDisabled: { backgroundColor: Colors.surfaceSunken },
});
