import { apiRequest } from '@/lib/api/client';
import type { Brand, Category, Offer, Product, Suggestion } from '@/models/catalog';
import type { ProductRecommendation, SupplierSearchResult } from '@/models/discovery';

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
  size?: number;
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
export function searchProducts(token: string, term: string, signal?: AbortSignal): Promise<Product[]> {
  return apiRequest<Product[]>(`/api/v1/search/products?q=${encodeURIComponent(term)}`, {
    token,
    signal,
  });
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

export function fetchProduct(token: string, productId: number): Promise<Product> {
  return apiRequest<Product>(`/api/v1/products/${productId}`, { token });
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

export function searchSuppliers(
  token: string,
  outletId: number,
  term?: string,
): Promise<SupplierSearchResult[]> {
  return apiRequest<SupplierSearchResult[]>(
    `/api/v1/search/suppliers${queryString({ outletId, q: term })}`,
    { token },
  );
}

function queryString(params: Record<string, unknown>): string {
  const pairs = Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}
