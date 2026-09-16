import { apiRequest } from '@/lib/api/client';
import type { Outlet } from '@/services/restaurant';
import type { Supplier } from '@/services/supplier';

export interface Restaurant {
  id: number;
  name: string;
  legalName: string | null;
  gstin: string | null;
  status: string;
  outlets: Outlet[];
}

export interface CreateRestaurantInput {
  name: string;
  legalName?: string;
  gstin?: string;
  firstOutlet: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode?: string;
    latitude?: string;
    longitude?: string;
    contactName?: string;
    contactPhone?: string;
  };
}

/**
 * Create a restaurant. The caller becomes its owner.
 *
 * <p>The first outlet travels with it, so setup is one round trip and a
 * restaurant cannot exist in a state where nobody can order for it.
 */
export function createRestaurant(token: string, input: CreateRestaurantInput): Promise<Restaurant> {
  return apiRequest<Restaurant>('/api/v1/restaurants', { method: 'POST', token, body: input });
}

export interface CreateSupplierInput {
  legalName: string;
  displayName: string;
  gstin?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  firstStore: {
    name: string;
    addressLine1: string;
    city: string;
    state: string;
    pincode?: string;
    latitude?: string;
    longitude?: string;
    contactName?: string;
    contactPhone?: string;
    responseSlaSeconds?: number;
    preparationMinutes?: number;
  };
}

export function createSupplier(token: string, input: CreateSupplierInput): Promise<Supplier> {
  return apiRequest<Supplier>('/api/v1/suppliers', { method: 'POST', token, body: input });
}

/**
 * Submit GST verification.
 *
 * <p>A supplier cannot trade until this is reviewed — `canTrade` stays false and
 * no restaurant sees their catalog. The registration screen says so rather than
 * letting someone list a hundred SKUs and wonder why nothing sells.
 */
export function submitVerification(
  token: string,
  supplierId: number,
  body: { verificationType: string; gstin: string; legalName: string; evidenceUrl?: string },
) {
  return apiRequest(`/api/v1/suppliers/${supplierId}/verification`, {
    method: 'POST',
    token,
    body,
  });
}
