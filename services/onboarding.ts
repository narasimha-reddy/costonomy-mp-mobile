import { requireStateCode, statesOrEmpty } from '@/lib/geo/states';
import { toOutletInput, toRestaurant } from '@/lib/org/mapping';
import type { CommonOrg } from '@/lib/org/types';
import { createOrg } from '@/services/org';
import type { Restaurant } from '@/services/restaurant';

export type { Restaurant };

/**
 * Registering a business. Restaurants and suppliers are created in costonomy-common-api, enrolled in the marketplace
 * in the same call (Marketplace API D-208): the caller becomes the owner, and the first outlet or store travels with
 * the business so there is no window in which one exists without a place to order for or ship from.
 *
 * <p>Marketplace enrollment needs the place's address line, city, state, PIN code and contact number, and a store's
 * pin; common refuses with `ENROLLMENT_REQUIREMENTS_UNMET` otherwise, so the screens ask for all of them.
 */

interface FirstPlace {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  /** The state's name as picked; sent as its code. */
  state: string;
  pincode: string;
  latitude?: string;
  longitude?: string;
  contactName?: string;
  contactPhone: string;
}

export interface CreateRestaurantInput {
  name: string;
  legalName?: string;
  gstin?: string;
  firstOutlet: FirstPlace;
}

/** Create a restaurant with its first outlet. The key belongs to the screen's attempt, so a retry is the same create. */
export async function createRestaurant(
  token: string,
  input: CreateRestaurantInput,
  idempotencyKey: string,
): Promise<Restaurant> {
  const stateCode = await requireStateCode(input.firstOutlet.state);
  const org = await createOrg(token, {
    orgType: 'RESTAURANT',
    displayName: input.name,
    legalName: input.legalName,
    gstin: input.gstin,
    contactPhone: input.firstOutlet.contactPhone,
    firstOutlet: { ...toOutletInput(input.firstOutlet, stateCode), kind: 'OUTLET', name: input.firstOutlet.name },
  }, idempotencyKey);
  return toRestaurant(org, await statesOrEmpty(), []);
}

export interface CreateSupplierInput {
  legalName: string;
  displayName: string;
  gstin?: string;
  /** Required. The first store copies both as its own starting point. D-097. */
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  /** Set after the person has seen common's possible matches and chose to register anyway. */
  ignoreClaimCandidates?: boolean;
  firstStore: FirstPlace & {
    /** Required, and its own answer: a branch is answered by whoever is on it. */
    contactName: string;
  };
}

/**
 * Create a supplier with its first store. A GSTIN given here is recorded on the business (unverified); submitting it
 * for verification is {@link submitGstinVerification}'s job, after this.
 *
 * <p>Common refuses with `CLAIM_CANDIDATES_EXIST` (details.candidates) when the GSTIN or phone matches a supplier a
 * buyer already listed; the screen explains and can resend with `ignoreClaimCandidates`.
 */
export async function createSupplier(
  token: string,
  input: CreateSupplierInput,
  idempotencyKey: string,
): Promise<CommonOrg> {
  const stateCode = await requireStateCode(input.firstStore.state);
  return createOrg(token, {
    orgType: 'SUPPLIER',
    displayName: input.displayName,
    legalName: input.legalName,
    gstin: input.gstin,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    ignoreClaimCandidates: input.ignoreClaimCandidates,
    firstOutlet: { ...toOutletInput(input.firstStore, stateCode), kind: 'STORE', name: input.firstStore.name },
  }, idempotencyKey);
}

export { submitGstinVerification } from '@/services/supplier';
