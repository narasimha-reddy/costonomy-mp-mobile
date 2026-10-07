import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiText } from '@/components/common';
import { sandboxNextStepLabel } from '@/lib/delivery/sandbox';
import type { Delivery } from '@/models/delivery';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * TEST ONLY (API D-154). The sandbox has no real riders, so the supplier side offers a way to move the rider along
 * and watch the flow. Shown only when the API says `sandboxControls`, never to a buyer (callers render it for the
 * supplier alone), and styled as a dashed info card so it cannot be mistaken for product UI.
 */
export function SandboxControlCard({
  delivery, onAdvance, pending = false,
}: {
  delivery: Pick<Delivery, 'id' | 'status' | 'sandboxControls'> | null;
  onAdvance: (deliveryId: number) => void;
  pending?: boolean;
}) {
  if (delivery == null || delivery.sandboxControls !== true) return null;
  const label = sandboxNextStepLabel(delivery.status);
  if (label == null) return null;
  return (
    <View style={styles.card} accessibilityLabel="Test mode">
      <MandiText variant="captionEmphasis" color={Colors.info}>Test mode</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Pidge sandbox has no real riders. Move the rider to the next step to see the flow.
      </MandiText>
      <MandiButton label={label} variant="secondary" size="md" onPress={() => onAdvance(delivery.id)} loading={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.infoLight,
    borderColor: Colors.info,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
});
