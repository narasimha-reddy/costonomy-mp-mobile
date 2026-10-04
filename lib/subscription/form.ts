import type { CreateSubscriptionPayload } from '@/services/subscription';
import type { SubscriptionFrequency } from '@/models/subscription';

/**
 * A subscription as the API accepts it (API D-132). What the server refuses is refused there; this only builds the body
 * from what was chosen and refuses what is plainly unfinished, so a typo is not quietly turned into an order of one.
 */

/** Wallet, or credit with an active agreement. The server refuses card and anything else. */
export type SubscriptionPaymentMethod = 'WALLET' | 'CREDIT';

/** The supplier delivers or the restaurant collects. Costonomy delivery is refused for subscriptions. */
export type SubscriptionDeliveryMode = 'SUPPLIER_DELIVERY' | 'PICKUP';

export const PAYMENT_METHODS: { value: SubscriptionPaymentMethod; label: string }[] = [
  { value: 'WALLET', label: 'Pay from wallet' },
  { value: 'CREDIT', label: 'Pay on credit' },
];

export const DELIVERY_MODES: { value: SubscriptionDeliveryMode; label: string }[] = [
  { value: 'SUPPLIER_DELIVERY', label: 'Supplier delivery' },
  { value: 'PICKUP', label: 'Store pickup' },
];

export function paymentMethodLabel(method: string | null | undefined): string | null {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? null;
}

export function deliveryModeLabel(mode: string | null | undefined): string | null {
  return DELIVERY_MODES.find((m) => m.value === mode)?.label ?? null;
}

/**
 * Tomorrow's date in India, as the server counts it (Asia/Kolkata). The phone's own UTC date can still be "today" for
 * five and a half hours after India's midnight. India keeps no daylight saving, so a fixed offset is exact.
 */
export function tomorrowInIndia(now: Date = new Date()): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + IST_OFFSET_MS + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface SubscriptionForm {
  supplierStoreId: number;
  supplierSkuId: number;
  /** As typed. */
  quantity: string;
  /** The SKU's own unit: shown, not chosen. The server uses the SKU's regardless. */
  unit: string;
  frequency: SubscriptionFrequency;
  startDate: string;
  paymentMethod: SubscriptionPaymentMethod;
  deliveryMode: SubscriptionDeliveryMode;
  preferredSlotId: number | null;
  notes: string;
}

export type SubscriptionPayloadResult =
  | { ok: true; payload: CreateSubscriptionPayload }
  | { ok: false; message: string };

export const QUANTITY_REQUIRED = 'Enter a quantity above zero.';

export function buildSubscriptionPayload(form: SubscriptionForm): SubscriptionPayloadResult {
  const quantity = form.quantity.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(quantity) || !(Number(quantity) > 0)) {
    return { ok: false, message: QUANTITY_REQUIRED };
  }
  return {
    ok: true,
    payload: {
      supplierStoreId: form.supplierStoreId,
      supplierSkuId: form.supplierSkuId,
      quantity,
      unit: form.unit,
      frequency: form.frequency,
      preferredSlotId: form.deliveryMode === 'PICKUP' ? undefined : form.preferredSlotId ?? undefined,
      deliveryMode: form.deliveryMode,
      paymentMethod: form.paymentMethod,
      startDate: form.startDate,
      notes: form.notes.trim() || undefined,
    },
  };
}
