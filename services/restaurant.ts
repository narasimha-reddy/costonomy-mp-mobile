import { apiRequest } from '@/lib/api/client';

/** Doc 04 §7's outlet shape. */
export interface Outlet {
  id: number;
  restaurantId: number;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  status: string;
}

export function fetchRestaurantOutlets(restaurantId: number, token: string): Promise<Outlet[]> {
  return apiRequest<Outlet[]>(`/api/v1/restaurants/${restaurantId}/outlets`, { token });
}

export function fetchOutlet(outletId: number, token: string): Promise<Outlet> {
  return apiRequest<Outlet>(`/api/v1/outlets/${outletId}`, { token });
}

/** Doc 04 §7's restaurant, with its outlets. */
export interface Restaurant {
  id: number;
  name: string;
  legalName: string | null;
  gstin: string | null;
  status: string;
  outlets: Outlet[];
}

export function fetchRestaurant(restaurantId: number, token: string): Promise<Restaurant> {
  return apiRequest<Restaurant>(`/api/v1/restaurants/${restaurantId}`, { token });
}

export interface RestaurantPatch {
  name?: string;
  legalName?: string;
  gstin?: string;
}

export function updateRestaurant(
  token: string,
  restaurantId: number,
  patch: RestaurantPatch,
): Promise<Restaurant> {
  return apiRequest<Restaurant>(`/api/v1/restaurants/${restaurantId}`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}

/**
 * Everything about where an outlet is and who to reach there.
 *
 * <p>Mirrors `RestaurantDtos.UpdateOutletRequest` field for field (D-061). The
 * create request is the same shape with name, address, city and state required —
 * expressed by validating before the call rather than by a second type that would
 * drift from this one.
 */
export interface OutletPatch {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: string;
  longitude?: string;
  googlePlaceId?: string;
  formattedAddress?: string;
  contactName?: string;
  contactPhone?: string;
  deliveryInstructions?: string;
  status?: string;
}

export function createOutlet(
  token: string,
  restaurantId: number,
  body: OutletPatch,
): Promise<Outlet> {
  return apiRequest<Outlet>(`/api/v1/restaurants/${restaurantId}/outlets`, {
    method: 'POST',
    token,
    body,
  });
}

export function updateOutlet(
  token: string,
  outletId: number,
  patch: OutletPatch,
): Promise<Outlet> {
  return apiRequest<Outlet>(`/api/v1/outlets/${outletId}`, {
    method: 'PATCH',
    token,
    body: patch,
  });
}
