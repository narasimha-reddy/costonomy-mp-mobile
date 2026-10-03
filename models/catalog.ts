import type { Money } from '@/utils/money';
import type { BrandOption } from './discovery';

/**
 * Catalog shapes as the API returns them (doc 04 §8).
 *
 * <p>Every decimal — price, GST, pack size, quantity — arrives as a string, and
 * stays one. `utils/money` explains why nothing here is a `number`: the moment a
 * rupee figure becomes a JS number, somebody adds two of them and a client-side
 * total appears on a checkout screen disagreeing with the order the backend made.
 */
export interface Category {
  id: number;
  parentId: number | null;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  displayOrder: number | null;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  description: string | null;
  baseUnit: string;
  basePackSize: Money;
  imageUrl: string | null;
  aliases: string[];
  /** How many purchasable offers exist — the "3 suppliers" line on a card. */
  offerCount: number | null;
  /** Lowest current price, for "from ₹X". Null when nothing is available. */
  lowestPrice: Money | null;
}

export type Availability = 'AVAILABLE' | 'OUT_OF_STOCK' | 'LIMITED';

/** One supplier's offer for a product, as the restaurant compares them (§23A.13). */
export interface Offer {
  offerId: number;
  supplierSkuId: number;
  supplierStoreId: number;
  supplierStoreName: string;
  supplierName: string;
  skuName: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  sellingPrice: Money;
  gstRate: Money;
  availability: Availability;
  availableQuantity: Money | null;
  responseSlaSeconds: number | null;
  preparationMinutes: number | null;
}

/** Search suggestion (doc 07 §3). */
export interface Suggestion {
  term: string;
  type: string;
  canonicalProductId: number | null;
  categoryName: string | null;
}

/**
 * One pack, in full — the page a kitchen decides on. D-096.
 *
 * <p>Price, GST and availability are the live offer, the same figures the shelf
 * row shows. A detail page that priced a SKU differently from the row that led
 * to it would be the worst possible place in the app to disagree.
 */
export interface SkuDetail {
  supplierSkuId: number;
  offerId: number | null;
  skuName: string;
  brandName: string | null;
  packSize: Money;
  packUnit: string;
  measureValue: Money | null;
  measureUnit: string | null;
  sellingPrice: Money | null;
  gstRate: Money | null;
  /** One pack with GST, computed by the server (guardrail 3). */
  unitPriceInclusiveGst: Money | null;
  availability: string | null;
  availableQuantity: Money | null;
  /** The thumbnail, then the gallery. */
  imageUrl: string | null;
  images: string[];
  youtubeUrl: string | null;
  description: string | null;
  lengthCm: Money | null;
  widthCm: Money | null;
  heightCm: Money | null;
  weightGrams: Money | null;
  canonicalProductId: number;
  canonicalProductName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  supplierStoreId: number;
  storeName: string | null;
  supplierName: string | null;
  distanceKm: Money | null;
  openNow: boolean;
  opensAt: string | null;
  etaMinutes: number | null;
  /** The store's rating — about the store, not this pack. */
  storeRating: Money | null;
  storeRatingCount: number;
  /** This pack's own rating. Null when nobody has reviewed it. */
  averageRating: Money | null;
  reviewCount: number;
  reviews: SkuReview[];
  /** Other packs of the same product from the same store. */
  otherPacks: SkuSibling[];
  /** All brand options for this item from this supplier, sorted lowest priced first. */
  brandOptions?: BrandOption[];
}

export interface SkuReview {
  id: number;
  rating: number;
  comment: string | null;
  /** Who, at outlet granularity. A person's name is not the point. */
  outletName: string | null;
  createdAt: string;
}

export interface SkuSibling {
  supplierSkuId: number;
  skuName: string;
  packSize: Money;
  packUnit: string;
  sellingPrice: Money | null;
  imageUrl: string | null;
  availability: string | null;
  brandName?: string | null;
  gstRate?: Money | null;
  unitPriceInclusiveGst?: Money | null;
  offerId?: number | null;
}
