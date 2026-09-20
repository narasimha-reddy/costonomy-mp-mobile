import { apiRequest } from '@/lib/api/client';
import type {
  Brand,
  Category,
  Offer,
  Product,
  SkuDetail,
  Suggestion,
} from '@/models/catalog';
import type {
  ProductRecommendation,
  StorefrontSku,
  SupplierSearchPage, PopularSupplier, StorefrontHeader } from '@/models/discovery';

export function fetchCategories(token: string): Promise<Category[]> {
  return apiRequest<Category[]>('/api/v1/categories', { token });
}

export function fetchBrands(token: string): Promise<Brand[]> {
  return apiRequest<Brand[]>('/api/v1/brands', { token });
}

export interface ProductQuery {
  [key: string]: unknown;
  categoryId?: number | null;
  page?: number;
  /** Defaults to 20 server-side, which is a page rather than a catalog. */
  size?: number;
  /**
   * Scopes "N suppliers" and "from ₹X" to suppliers who deliver to this outlet.
   *
   * <p>Without it those figures are platform-wide, which is a different and
   * usually larger number — a supplier in another city counts. Every restaurant
   * screen passes it; the figures are the reason someone taps the card.
   */
  outletId?: number | null;
}

export function fetchProducts(token: string, query: ProductQuery = {}): Promise<Product[]> {
  return apiRequest<Product[]>(`/api/v1/products${queryString(query)}`, { token });
}

/**
 * Product search. Doc 07 §2.
 *
 * <p>The list carries `lowestPrice` for a "from ₹X" line. Doc 05 §6: **never
 * present that as the checkout price** — it is a catalog figure that can be
 * minutes old, and the authoritative price is the one validation returns.
 */
export function searchProducts(
  token: string,
  term: string,
  outletId?: number,
  signal?: AbortSignal,
): Promise<Product[]> {
  return apiRequest<Product[]>(
    `/api/v1/search/products${queryString({ q: term, outletId })}`,
    { token, signal },
  );
}

export function fetchSuggestions(
  token: string,
  term: string,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  return apiRequest<Suggestion[]>(`/api/v1/search/suggestions?q=${encodeURIComponent(term)}`, {
    token,
    signal,
  });
}

export function fetchProduct(
  token: string,
  productId: number,
  outletId?: number,
): Promise<Product> {
  return apiRequest<Product>(
    `/api/v1/products/${productId}${queryString({ outletId })}`,
    { token },
  );
}

/** Live offers for a product, cheapest first. `outletId` scopes serviceability. */
export function fetchOffers(token: string, productId: number, outletId: number): Promise<Offer[]> {
  return apiRequest<Offer[]>(`/api/v1/products/${productId}/offers?outletId=${outletId}`, { token });
}

/** Ranked offers, with the reasons behind the ranking (doc 07 §8). */
export function fetchRecommendations(
  token: string,
  productId: number,
  outletId: number,
  quantity?: string,
): Promise<ProductRecommendation> {
  return apiRequest<ProductRecommendation>(
    `/api/v1/products/${productId}/recommendations${queryString({ outletId, quantity })}`,
    { token },
  );
}

/**
 * Suppliers that deliver to this outlet, nearest first.
 *
 * <p><b>With a term it is a search; without one it is the directory.</b> That
 * second half is new — the endpoint used to require two characters, so "who can
 * deliver to me" was a question the app could not ask.
 *
 * <p>Membership is each store's **own** declared radius, so `radiusKm` narrows a
 * list rather than defining it, and whatever it excludes comes back as
 * `beyondRadius` instead of vanishing.
 */
export function searchSuppliers(
  token: string,
  term: string,
  outletId?: number,
  radiusKm?: number,
  signal?: AbortSignal,
): Promise<SupplierSearchPage> {
  return apiRequest<SupplierSearchPage>(
    `/api/v1/search/suppliers${queryString({ q: term, outletId, radiusKm })}`,
    { token, signal },
  );
}

/**
 * SKU search — the other half of `searchProducts`.
 *
 * <p>`searchProducts` answers "what is curd": one row per canonical product.
 * This answers "what curd can I buy right now": one row per supplier's pack, with
 * its own price and picture.
 */
export function searchSkus(
  token: string,
  term: string,
  outletId?: number,
  signal?: AbortSignal,
): Promise<StorefrontSku[]> {
  return apiRequest<StorefrontSku[]>(
    `/api/v1/search/skus${queryString({ q: term, outletId })}`,
    { token, signal },
  );
}

/** Everything one supplier store sells, for the restaurant-facing catalog. */
/**
 * The store header: identity, distance, ETA, rating, branches and credit.
 *
 * <p>`outletId` is what makes this private — with one, the server checks the
 * caller is scoped to that outlet before it says a word about credit.
 */
export function fetchStorefrontHeader(
  token: string,
  storeId: number,
  outletId?: number,
): Promise<StorefrontHeader> {
  return apiRequest<StorefrontHeader>(
    `/api/v1/supplier-stores/${storeId}/storefront${queryString({ outletId })}`,
    { token },
  );
}

/**
 * One pack, in full. D-096.
 *
 * <p>`outletId` only supplies distance and an ETA — there is nothing private
 * on this page, and a kitchen comparing before they pick an outlet should still
 * see it.
 */
export function fetchSkuDetail(
  token: string,
  skuId: number,
  outletId?: number,
): Promise<SkuDetail> {
  return apiRequest<SkuDetail>(
    `/api/v1/supplier-skus/${skuId}${queryString({ outletId })}`,
    { token },
  );
}

/** Review a pack you received. Keyed on the order line, which is the proof. */
export function reviewSku(
  token: string,
  orderItemId: number,
  body: { rating: number; comment?: string },
): Promise<unknown> {
  return apiRequest<unknown>(`/api/v1/supplier-order-items/${orderItemId}/review`, {
    method: 'POST',
    token,
    body,
  });
}

export function fetchStoreCatalog(
  token: string,
  storeId: number,
  outletId?: number,
  term?: string,
): Promise<StorefrontSku[]> {
  return apiRequest<StorefrontSku[]>(
    `/api/v1/supplier-stores/${storeId}/catalog${queryString({ outletId, q: term })}`,
    { token },
  );
}

function queryString(params: Record<string, unknown>): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

/**
 * The unit vocabulary, fetched rather than hard-coded.
 *
 * <p>D-079 is the reason this is a request: a client keeping its own copy of a
 * server vocabulary compiles perfectly while being wrong, and nothing notices
 * until a comparison silently stops matching. Cached for the session — the list
 * changes when the server is deployed, not while someone is filling in a form.
 */
export interface Units {
  packUnits: string[];
  /** Pack units that must also state what is inside them. */
  requiresMeasure: string[];
  measureUnits: string[];
}

export function fetchUnits(token: string): Promise<Units> {
  return apiRequest<Units>('/api/v1/units', { token });
}

/**
 * Suppliers worth putting in front of this kitchen, with what they stock.
 *
 * <p>"Popular" is the server's placeholder — it returns the nearest active
 * suppliers who list something, until a real ranking exists. The name is what
 * it is meant to become, so this call does not change when it does.
 */
export function fetchPopularSuppliers(
  token: string,
  outletId: number,
  limit = 10,
  /**
   * Narrow to one aisle.
   *
   * <p>Sent to the server rather than filtered here: each supplier's
   * `categories` is capped at six for display, so filtering that list would
   * drop a supplier who stocks the aisle but lists six others more deeply.
   */
  categoryId?: number | null,
): Promise<PopularSupplier[]> {
  const aisle = categoryId == null ? '' : `&categoryId=${categoryId}`;
  return apiRequest<PopularSupplier[]>(
    `/api/v1/outlets/${outletId}/suppliers/popular?limit=${limit}${aisle}`,
    { token },
  );
}
