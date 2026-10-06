export type SubscriptionFrequency = 'DAILY' | 'WEEKDAYS' | 'ALTERNATE_DAYS' | 'WEEKLY';
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface Subscription {
  id: number;
  outletId: number;
  outletName: string;
  supplierStoreId: number;
  storeName: string;
  canonicalProductId: number | null;
  productName: string | null;
  productImage: string | null;
  supplierSkuId: number;
  skuDescription: string;
  quantity: string;
  unit: string;
  frequency: SubscriptionFrequency;
  preferredSlotId: number | null;
  preferredSlotName: string | null;
  deliveryMode: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
  nextDeliveryDate: string | null;
  skipDates: string[];
  notes: string | null;
  paymentMethod: 'WALLET' | 'CREDIT' | null;
}

export interface ManifestItemSummary {
  supplierSkuId: number;
  canonicalProductId: number | null;
  productName: string;
  totalQuantity: string;
  unit: string;
}

export interface ManifestDeliveryOrder {
  subscriptionId: number;
  outletId: number;
  outletName: string;
  restaurantName: string;
  outletAddress: string;
  contactPhone: string;
  slotId: number | null;
  slotName: string;
  supplierSkuId: number;
  productName: string;
  quantity: string;
  unit: string;
  deliveryMode: string;
}

export interface SubscriptionManifest {
  date: string;
  supplierStoreId: number;
  aggregatedItems: ManifestItemSummary[];
  deliveries: ManifestDeliveryOrder[];
}

