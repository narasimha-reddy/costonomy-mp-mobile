import { apiRequest } from './client';

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
