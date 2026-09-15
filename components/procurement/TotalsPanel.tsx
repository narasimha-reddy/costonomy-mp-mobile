import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Procurement } from '@/models/procurement';
import { MandiText } from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * The order totals. Doc 05 §11.
 *
 * <p><b>Every figure is the server's.</b> Guardrail 3 — this renders
 * `totalAmount`, it never adds anything up. `utils/money` has no `sum` for the
 * same reason.
 *
 * <p>Delivery is shown only when there is a real figure. The fee is not quoted
 * until a courier is assigned after Ready for Pickup, so a "₹0.00" line here
 * would read as "free delivery" when it means "not known yet".
 */
export function TotalsPanel({ procurement }: { procurement: Procurement }) {
  const delivery = Number(procurement.totalDeliveryFee);
  const hasDelivery = Number.isFinite(delivery) && delivery > 0;

  return (
    <View style={styles.panel}>
      <Row label="Items" value={formatMoney(procurement.totalItemValue)} />
      <Row label="GST" value={formatMoney(procurement.totalGst)} />
      {hasDelivery ? (
        <Row label="Delivery" value={formatMoney(procurement.totalDeliveryFee)} />
      ) : (
        <Row label="Delivery" value="Quoted after pickup" muted />
      )}
      <View style={styles.rule} />
      <Row label="Total" value={formatMoney(procurement.totalAmount)} emphasis />
    </View>
  );
}

function Row({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
        {label}
      </MandiText>
      <MandiText
        variant={emphasis ? 'price' : 'body'}
        color={muted ? Colors.textTertiary : undefined}
      >
        {value}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.sm,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.xs },
});
