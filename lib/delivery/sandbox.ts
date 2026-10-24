import type { DeliveryStatus } from '@/models/delivery';

/**
 * TEST ONLY (API D-154). The label of the button that moves a sandbox rider to the next step, by the delivery's
 * current status. Mirrors the API's table; the API decides whether the button is offered at all (`sandboxControls`).
 */
const NEXT_STEP: Partial<Record<DeliveryStatus, string>> = {
  PROVIDER_SELECTED: 'Assign a delivery partner',
  DRIVER_ASSIGNED: 'Delivery partner reached your store',
  DRIVER_AT_PICKUP: 'Delivery partner picked up',
  PICKED_UP: 'Delivery partner on the way',
  IN_TRANSIT: 'Delivery partner arrived',
  ARRIVED_AT_DESTINATION: 'Mark delivered',
};

export function sandboxNextStepLabel(status: DeliveryStatus): string | null {
  return NEXT_STEP[status] ?? null;
}
