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
  /** The SKU's own picture, already falling back to the canonical product's. */
  imageUrl: string | null;
  /** Null when nobody has rated this store. Absent stays absent (doc 07 §4). */
  averageRating: Money | null;
  ratingCount: number;
  /**
   * Pack price ÷ pack size, computed by the server.
   *
   * <p>What makes a 1 kg pack and a 25 kg sack comparable, which is the point of
   * the screen. Null when the pack is not measured in the product's own unit —
   * a price "per PKT" against a product sold by the kilo says nothing.
   */
  pricePerBaseUnit: Money | null;
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
  /**
   * How many of this store's buyable items matched the term.
   *
   * <p>Zero with no term, and zero for a store that matched on its name alone.
   */
  matchingProductCount: number;
  /** Null when nobody has rated this store — never 0 standing in for "unrated". */
  averageRating: Money | null;
  ratingCount: number;
  openNow: boolean;
  opensAt: string | null;
}

/**
 * A page of suppliers, and how many a distance filter left out.
 *
 * <p>`beyondRadius` is what lets the app say "4 more deliver here" instead of
 * presenting a filtered list as the whole answer.
 */
export interface SupplierSearchPage {
  suppliers: SupplierSearchResult[];
  beyondRadius: number;
}

/**
 * One thing a restaurant can buy, from one supplier. D-061: mirrors
 * `DiscoveryDtos.StorefrontSku` field for field.
 *
 * <p>It leads with the SKU because the SKU is what is being bought — this pack,
 * this brand, this price — and carries the supplier as context. That is the whole
 * difference between this and `Product`, which answers "what is curd" rather than
 * "what curd can I buy right now".
 */
export interface StorefrontSku {
  offerId: number;
  supplierSkuId: number;
  skuName: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  sellingPrice: Money;
  gstRate: Money;
  availability: string;
  availableQuantity: Money | null;
  /** The SKU's own picture, already falling back to the canonical product's. */
  imageUrl: string | null;
  canonicalProductId: number;
  canonicalProductName: string;
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  distanceKm: Money | null;
  openNow: boolean;
  opensAt: string | null;
  preparationMinutes: number | null;
  averageRating: Money | null;
  ratingCount: number;
}
