import type { Money } from '@/utils/money';

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
