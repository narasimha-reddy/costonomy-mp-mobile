import { commonRequest } from '@/lib/api/common';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type {
  CommonIdentifier,
  CommonOrg,
  CommonOrgInput,
  CommonOutlet,
  CommonOutletInput,
  CommonSettings,
  OrgType,
  SupplierStanding,
} from '@/lib/org/types';

/**
 * Businesses, outlets and stores in costonomy-common-api, which owns them (Marketplace API D-208, common D-85), plus
 * the one thing the Marketplace API still answers about them: a supplier's standing.
 *
 * <p>These are the raw calls. `services/restaurant.ts` and `services/supplier.ts` combine them into the app's own
 * `Restaurant`, `Outlet`, `Supplier` and `SupplierStore`.
 */

const MARKETPLACE = 'MARKETPLACE';

// ── businesses ─────────────────────────────────────────────────────────

export interface CreateOrgInput extends CommonOrgInput {
  orgType: OrgType;
  displayName: string;
  gstin?: string;
  /** Common refuses a supplier that may already be listed (CLAIM_CANDIDATES_EXIST) unless this is set. */
  ignoreClaimCandidates?: boolean;
  firstOutlet: CommonOutletInput & { kind: 'OUTLET' | 'STORE'; name: string };
}

/**
 * Create a business with its first outlet or store, enrolled in the marketplace. The caller becomes its owner.
 *
 * <p>MARKETPLACE enrollment needs the outlet's address line, city, state code, PIN code and contact number, and a
 * store's coordinates; common refuses with `ENROLLMENT_REQUIREMENTS_UNMET` (details.missing) otherwise.
 */
export function createOrg(token: string, input: CreateOrgInput, idempotencyKey: string): Promise<CommonOrg> {
  return commonRequest<CommonOrg>('/v1/orgs', {
    method: 'POST',
    token,
    idempotencyKey,
    body: { ...input, enrollApps: [MARKETPLACE] },
  });
}

export function getOrg(token: string, orgId: number): Promise<CommonOrg> {
  return commonRequest<CommonOrg>(`/v1/orgs/${orgId}`, { token });
}

/** Null or absent fields stay as they are. */
export function patchOrg(token: string, orgId: number, input: CommonOrgInput): Promise<CommonOrg> {
  return commonRequest<CommonOrg>(`/v1/orgs/${orgId}`, { method: 'PATCH', token, body: input });
}

export async function listOrgOutlets(token: string, orgId: number): Promise<CommonOutlet[]> {
  const body = await commonRequest<{ items: CommonOutlet[] }>(`/v1/orgs/${orgId}/outlets`, { token });
  return body?.items ?? [];
}

// ── outlets and stores ─────────────────────────────────────────────────

export function createOrgOutlet(
  token: string,
  orgId: number,
  input: CommonOutletInput,
  idempotencyKey: string,
): Promise<CommonOutlet> {
  return commonRequest<CommonOutlet>(`/v1/orgs/${orgId}/outlets`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: input,
  });
}

export function getOutlet(token: string, outletId: number): Promise<CommonOutlet> {
  return commonRequest<CommonOutlet>(`/v1/outlets/${outletId}`, { token });
}

export function patchOutlet(token: string, outletId: number, input: CommonOutletInput): Promise<CommonOutlet> {
  return commonRequest<CommonOutlet>(`/v1/outlets/${outletId}`, { method: 'PATCH', token, body: input });
}

/** ACTIVE or INACTIVE (reopen / close for now). CLOSED is permanent in common and the app does not offer it. */
export function setOutletStatus(token: string, outletId: number, status: 'ACTIVE' | 'INACTIVE'): Promise<CommonOutlet> {
  return commonRequest<CommonOutlet>(`/v1/outlets/${outletId}/status`, { method: 'POST', token, body: { status } });
}

// ── the marketplace's own outlet and store settings ────────────────────

export function getMarketplaceSettings(token: string, outletId: number): Promise<CommonSettings> {
  return commonRequest<CommonSettings>(`/v1/outlets/${outletId}/settings?app=${MARKETPLACE}`, { token });
}

/**
 * Set one setting. Outlet admins may set deliveryInstructions, preparationMinutes, online and directOrdersEnabled;
 * responseSlaSeconds and chatEnabled are Costonomy's.
 */
export function putMarketplaceSetting(
  token: string,
  outletId: number,
  configKey: string,
  value: string | number | boolean,
): Promise<unknown> {
  // Common's own catalogue types the keys it knows; this only matters for a key it does not.
  const type = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
  return commonRequest(`/v1/outlets/${outletId}/settings?app=${MARKETPLACE}`, {
    method: 'PUT',
    token,
    body: { configKey, value: String(value), type },
  });
}

/** Clear one setting, so the marketplace's default applies again. One that was never set is already clear. */
export async function clearMarketplaceSetting(token: string, outletId: number, configKey: string): Promise<void> {
  try {
    await commonRequest<void>(
      `/v1/outlets/${outletId}/settings?app=${MARKETPLACE}&configKey=${encodeURIComponent(configKey)}`,
      { method: 'DELETE', token },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
}

// ── identifiers and verification ───────────────────────────────────────

export async function listIdentifiers(token: string, orgId: number): Promise<CommonIdentifier[]> {
  const body = await commonRequest<{ items: CommonIdentifier[] }>(`/v1/orgs/${orgId}/identifiers`, { token });
  return body?.items ?? [];
}

export function addIdentifier(
  token: string,
  orgId: number,
  input: { idType: 'GSTIN'; idValue: string; legalNameOnRecord?: string },
): Promise<CommonIdentifier> {
  return commonRequest<CommonIdentifier>(`/v1/orgs/${orgId}/identifiers`, { method: 'POST', token, body: input });
}

/** Change an unverified identifier's value. Common refuses a verified one. */
export function updateIdentifier(token: string, identifierId: number, idValue: string): Promise<CommonIdentifier> {
  return commonRequest<CommonIdentifier>(`/v1/identifiers/${identifierId}`, {
    method: 'PATCH',
    token,
    body: { idValue },
  });
}

export interface VerificationRequest {
  id: number;
  subjectType: string;
  subjectId: number;
  checkType: string;
  /** PENDING, VERIFIED, REJECTED, INFO_REQUESTED … */
  status: string;
  decisionReason?: string | null;
  createdAt?: string;
}

/**
 * Ask Costonomy to verify one of the business's identifiers (common's verification queue). The identifier is marked
 * pending; the decision reaches the supplier's standing.
 */
export function submitIdentifierVerification(
  token: string,
  orgId: number,
  identifier: CommonIdentifier,
  data: Record<string, unknown>,
  idempotencyKey: string,
): Promise<VerificationRequest> {
  return commonRequest<VerificationRequest>(`/v1/orgs/${orgId}/verifications`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: {
      subjectType: 'BUSINESS_IDENTIFIER',
      subjectId: identifier.id,
      checkType: identifier.idType,
      data,
    },
  });
}

// ── the Marketplace API's view of a supplier ───────────────────────────

/** Lifecycle, verification, canTrade and each store's state, as the marketplace sees them. Needs business.view. */
export function fetchSupplierStanding(token: string, supplierId: number): Promise<SupplierStanding> {
  return apiRequest<SupplierStanding>(`/api/v1/suppliers/${supplierId}/standing`, { token });
}
