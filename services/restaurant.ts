import { newIdempotencyKey } from '@/lib/api/client';
import { requireStateCode, statesOrEmpty } from '@/lib/geo/states';
import { activeGstin, toOutlet, toOutletInput, toRestaurant } from '@/lib/org/mapping';
import { MP_SETTING } from '@/lib/org/types';
import {
  addIdentifier,
  clearMarketplaceSetting,
  createOrgOutlet,
  getMarketplaceSettings,
  getOrg,
  getOutlet,
  listIdentifiers,
  listOrgOutlets,
  patchOrg,
  patchOutlet,
  putMarketplaceSetting,
  setOutletStatus,
  updateIdentifier,
} from '@/services/org';

/**
 * Restaurants and their outlets, which live in costonomy-common-api (Marketplace API D-208). The app keeps its own
 * shapes (doc 04 §7's) and maps common's records onto them in `lib/org/mapping.ts`.
 */

/** An outlet. `restaurantId` is common's business id; `state` is the state's name, `stateCode` what common stores. */
export interface Outlet {
  id: number;
  restaurantId: number;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  /** The outlet's MARKETPLACE setting. Null in the outlet list, which does not read settings. */
  deliveryInstructions: string | null;
  /** Common's status: ACTIVE, INACTIVE (closed for now), CLOSED or SUSPENDED. */
  status: string;
}

/** The outlets of one restaurant (business), from common. */
export async function fetchRestaurantOutlets(restaurantId: number, token: string): Promise<Outlet[]> {
  const [outlets, states] = await Promise.all([listOrgOutlets(token, restaurantId), statesOrEmpty()]);
  return outlets.map((o) => toOutlet(o, states));
}

/** One outlet with its delivery instructions (a MARKETPLACE setting). */
export async function fetchOutlet(outletId: number, token: string): Promise<Outlet> {
  const [outlet, settings, states] = await Promise.all([
    getOutlet(token, outletId),
    // Settings are a detail: an outlet that cannot read them still shows.
    getMarketplaceSettings(token, outletId).catch(() => null),
    statesOrEmpty(),
  ]);
  return toOutlet(outlet, states, settings);
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

export async function fetchRestaurant(restaurantId: number, token: string): Promise<Restaurant> {
  const [org, identifiers, states] = await Promise.all([
    getOrg(token, restaurantId),
    listIdentifiers(token, restaurantId).catch(() => []),
    statesOrEmpty(),
  ]);
  return toRestaurant(org, states, identifiers);
}

export interface RestaurantPatch {
  name?: string;
  legalName?: string;
  /** Absent or blank leaves the GSTIN on file as it is. */
  gstin?: string;
}

/**
 * Rename the restaurant, and record or correct its GSTIN.
 *
 * <p>The GSTIN is one of the business's identifiers in common: a new one is added, an unverified one is corrected,
 * and a verified one is refused by common with its own message (it was verified against that number).
 */
export async function updateRestaurant(
  token: string,
  restaurantId: number,
  patch: RestaurantPatch,
): Promise<Restaurant> {
  if (patch.name !== undefined || patch.legalName !== undefined) {
    await patchOrg(token, restaurantId, { displayName: patch.name, legalName: patch.legalName });
  }
  const gstin = patch.gstin?.trim().toUpperCase();
  if (gstin) {
    const current = activeGstin(await listIdentifiers(token, restaurantId));
    if (current == null) {
      await addIdentifier(token, restaurantId, { idType: 'GSTIN', idValue: gstin });
    } else if (current.idValue !== gstin) {
      await updateIdentifier(token, current.id, gstin);
    }
  }
  return fetchRestaurant(restaurantId, token);
}

/**
 * Everything about where an outlet is and who to reach there, as the outlet screens hold it.
 *
 * <p>`state` is the name the person picked; it is sent to common as its code. `deliveryInstructions` is the outlet's
 * MARKETPLACE setting (blank clears it), and `status` goes through common's status endpoint.
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

async function saveDeliveryInstructions(token: string, outletId: number, text: string | undefined): Promise<void> {
  if (text === undefined) return;
  if (text.trim() === '') {
    await clearMarketplaceSetting(token, outletId, MP_SETTING.deliveryInstructions);
  } else {
    await putMarketplaceSetting(token, outletId, MP_SETTING.deliveryInstructions, text.trim());
  }
}

/** Add an outlet to the restaurant. The idempotency key belongs to the screen's attempt, so a retry is the same add. */
export async function createOutlet(
  token: string,
  restaurantId: number,
  body: OutletPatch,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<Outlet> {
  const stateCode = await requireStateCode(body.state);
  const created = await createOrgOutlet(
    token,
    restaurantId,
    toOutletInput({ ...body, kind: 'OUTLET' }, stateCode),
    idempotencyKey,
  );
  await saveDeliveryInstructions(token, created.id, body.deliveryInstructions || undefined);
  return fetchOutlet(created.id, token);
}

export async function updateOutlet(
  token: string,
  outletId: number,
  patch: OutletPatch,
): Promise<Outlet> {
  const stateCode = patch.state !== undefined ? await requireStateCode(patch.state) : null;
  await patchOutlet(token, outletId, toOutletInput(patch, stateCode));
  await saveDeliveryInstructions(token, outletId, patch.deliveryInstructions);
  if (patch.status === 'ACTIVE' || patch.status === 'INACTIVE') {
    const current = await getOutlet(token, outletId);
    if (current.status !== patch.status) await setOutletStatus(token, outletId, patch.status);
  }
  return fetchOutlet(outletId, token);
}
