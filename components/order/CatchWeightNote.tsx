import React from 'react';
import { MandiText } from '@/components/common';
import { Colors } from '@/theme';
import { formatQuantity, type Money } from '@/utils/money';

/**
 * What a restaurant is told about a line sold by weight (API D-128): the price they see is an estimate, because the
 * supplier weighs it before it is sent and the bill follows the scale. The server never bills more than was accepted, so
 * "never more than this" is true, and after weighing the line says what was billed instead.
 */
export const CATCH_WEIGHT_ESTIMATE =
  'Estimated. The final price follows the scale weight and will never be more than this.';

export function CatchWeightNote({
  billed,
  unit,
}: {
  /** The quantity billed once weighed, as the server sent it; null or absent before weighing. */
  billed?: Money | number | null;
  unit?: string | null;
}) {
  const weighed = billed != null;
  return (
    <MandiText variant="caption" color={Colors.textSecondary} testID="catch-weight-note">
      {weighed ? `Weighed and billed ${formatQuantity(billed, unit)}` : CATCH_WEIGHT_ESTIMATE}
    </MandiText>
  );
}
