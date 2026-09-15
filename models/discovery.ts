import type { Money } from '@/utils/money';

/**
 * Ranked offers. Doc 07 §8.
 *
 * <p>`explanations` is why an offer ranked where it did, and §23A.13 requires the
 * recommended one to say so. There is deliberately no commission field anywhere
 * in this shape — guardrail 9: commission is never a ranking factor and must
 * never be renderable as one.
 */
export type ExplanationCode =
  | 'LOWEST_PRICE'
  | 'FASTEST_DELIVERY'
  | 'HIGH_RELIABILITY'
  | 'HIGH_FILL_RATE'
  | 'NEARBY'
  | 'FULL_QUANTITY'
  | 'HIGHLY_RATED'
  | 'PREVIOUSLY_ORDERED';

export interface RecommendedOffer {
  offerId: number;
  supplierSkuId: number;
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  skuName: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  unitPrice: Money;
  gstRate: Money;
  itemTotal: Money;
  gstAmount: Money;
  /**
   * Item + GST. Delivery is **not** included — it is not quoted until a provider
   * is chosen after Ready for Pickup, and a guessed figure inside a total is a
   * made-up commercial value.
   */
  effectiveTotal: Money;
  availability: string;
  availableQuantity: Money | null;
  coversFullQuantity: boolean;
  etaMinutes: number | null;
  distanceKm: Money | null;
  responseSlaSeconds: number | null;
  explanations: ExplanationCode[];
  score: Money | null;
  scoreComponents: Record<string, Money> | null;
}

export interface ProductRecommendation {
  canonicalProductId: number;
  productName: string;
  requestedQuantity: Money | null;
  unit: string | null;
  offers: RecommendedOffer[];
  /** Why the list is empty, when it is. §23A.15: an unmet item is shown, never dropped. */
  unservedReason: string | null;
}

export interface SupplierSearchResult {
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  city: string | null;
  distanceKm: Money | null;
  serviceable: boolean;
  productCount: number | null;
}
