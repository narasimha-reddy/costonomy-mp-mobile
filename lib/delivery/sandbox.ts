import type { DeliveryStatus } from '@/models/delivery';

/**
 * TEST ONLY (API D-188). The label of the button that moves a sandbox rider to the next step, by the delivery's
 * current status. Mirrors the API's table; the API decides whether the button is offered at all (`sandboxControls`).
 */
const NEXT_STEP: Partial<Record<DeliveryStatus, string>> = {
  PROVIDER_SELECTED: 'Assign a rider',
  DRIVER_ASSIGNED: 'Rider reached your store',
  DRIVER_AT_PICKUP: 'Rider picked up',
  PICKED_UP: 'Rider on the way',
  IN_TRANSIT: 'Rider arrived',
  ARRIVED_AT_DESTINATION: 'Mark delivered',
};

export function sandboxNextStepLabel(status: DeliveryStatus): string | null {
  return NEXT_STEP[status] ?? null;
}
