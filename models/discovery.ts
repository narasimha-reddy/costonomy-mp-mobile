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
export interface BrandOption {
  supplierSkuId: number;
  offerId: number | null;
  skuName: string;
  brandName: string | null;
  grade?: string | null;
  packSize: Money;
  packUnit: string;
  sellingPrice: Money;
  mrp?: Money | null;
  discountAmount?: Money | null;
  discountPercent?: number | null;
  gstRate: Money | null;
  unitPriceInclusiveGst: Money | null;
  imageUrl: string | null;
  availability: string;
  availableQuantity: Money | null;
  measureValue: Money | null;
  measureUnit: string | null;
}

export interface RecommendedOffer {
  offerId: number;
  supplierSkuId: number;
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  skuName: string;
  brandName: string | null;
  grade?: string | null;
  packSize: Money;
  packUnit: string;
  mrp?: Money | null;
  unitPrice: Money;
  discountAmount?: Money | null;
  discountPercent?: number | null;
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
   * One pack including GST — what is actually paid for it.
   *
   * <p>`unitPrice` is the supplier's pre-tax price, which is what the order is
   * built from and the wrong figure to lead a card with: it sat beside a line
   * total that did include GST, so one card showed two numbers on two bases.
   */
  unitPriceInclusiveGst: Money;
  /**
   * What one base unit costs including GST, computed by the server.
   *
   * <p>What makes a 1 kg pack and a 25 kg sack comparable, which is the point of
   * the screen. Null when the pack is not measured in the product's own unit —
   * a price "per PKT" against a product sold by the kilo says nothing.
   */
  pricePerBaseUnit: Money | null;
  /**
   * How many other packs of this product the same store lists. D-096.
   *
   * <p>The comparison ranks one card per supplier, so this is what says the
   * rest exist.
   */
  otherPackCount: number;
  /** All brand options for this item from this supplier, sorted lowest priced first. */
  brandOptions?: BrandOption[];
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
  grade?: string | null;
  packSize: Money;
  packUnit: string;
  mrp?: Money | null;
  sellingPrice: Money;
  discountAmount?: Money | null;
  discountPercent?: number | null;
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
  /**
   * The aisle this belongs in, from the canonical product.
   *
   * <p>Not from the supplier's listing: two suppliers' paneer has to land in
   * the same tab, or the tabs sort by whoever typed what.
   */
  categoryId: number | null;
  categoryName: string | null;
  /** The amount inside one pack, where a pack has one. */
  measureValue: Money | null;
  measureUnit: string | null;
  /** All brand options for this item from this supplier, sorted lowest priced first. */
  brandOptions?: BrandOption[];
}

/**
 * A supplier worth putting in front of a kitchen, and what they stock.
 *
 * <p>The categories are the point. "Metro Fresh Supplies, 5 km away" says
 * nothing about whether they are worth opening; "Dairy, Vegetables, Staples"
 * is the whole decision — and it is a fact about their catalogue rather than
 * anything they wrote about themselves.
 */
export interface PopularSupplier {
  supplierStoreId: number;
  supplierName: string;
  storeName: string;
  locality: string | null;
  city: string | null;
  distanceKm: Money | null;
  averageRating: Money | null;
  ratingCount: number;
  /** How much they list, purchasable today. */
  skuCount: number;
  openNow: boolean;
  /** Orders can be placed here without sending a request first. D-094. */
  directOrdersEnabled: boolean;
  categories: SupplierCategory[];
}

export interface SupplierCategory {
  categoryId: number;
  name: string;
  skuCount: number;
}

/**
 * The head of one supplier's shelf, for the kitchen standing in front of it.
 *
 * <p>One request rather than four, because "should I shop here" is one
 * question: which branch this is, how far and how long, what other kitchens
 * thought, and whether this supplier has given them terms.
 */
export interface StorefrontHeader {
  supplierStoreId: number;
  /** The branch. The title — it is where the goods come from. */
  storeName: string;
  /** The organisation behind it, shown beneath the branch. */
  supplierName: string;
  city: string | null;
  distanceKm: Money | null;
  openNow: boolean;
  opensAt: string | null;
  /** Preparation plus travel. Null when either end has no coordinates. */
  etaMinutes: number | null;
  /** Null when nobody has rated this store. Never zero standing in for that. */
  averageRating: Money | null;
  ratingCount: number;
  skuCount: number;
  /** Orders can be placed here without sending a request first. D-094. */
  directOrdersEnabled: boolean;
  /** Null when this supplier has extended this outlet nothing. */
  credit: StoreCredit | null;
  otherStores: SiblingStore[];
}

/**
 * What this supplier has extended this outlet.
 *
 * <p>`available` is the server's and is never recomputed here — what is left to
 * spend nets off reservations against orders already in flight, which this app
 * cannot see (§23A.24).
 */
export interface StoreCredit {
  agreementId: number;
  status: string;
  approvedLimit: Money;
  utilized: Money;
  reserved: Money;
  available: Money;
  creditPeriodDays: number | null;
  /** Whether an order can actually draw on it right now. Stated, not inferred. */
  canFund: boolean;
}

/** Another branch of the same supplier. */
export interface SiblingStore {
  supplierStoreId: number;
  storeName: string;
  city: string | null;
  distanceKm: Money | null;
  openNow: boolean;
}
