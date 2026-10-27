import type { Outlet, Restaurant } from '@/services/restaurant';
import type { Supplier, SupplierStore } from '@/services/supplier';
import { stateNameFor, type GeoState } from '@/lib/geo/states';
import { fromCommonHours } from '@/lib/org/operatingHours';
import {
  MP_SETTING,
  type CommonIdentifier,
  type CommonOrg,
  type CommonOutlet,
  type CommonOutletInput,
  type CommonSettings,
  type SupplierStanding,
} from '@/lib/org/types';

/**
 * costonomy-common-api's records as the app's types. Pure, so the field-by-field mapping is tested on its own
 * (`tests/orgMapping.test.ts`); the services fetch and these shape.
 */

// ── settings ───────────────────────────────────────────────────────────

/** A numeric setting, whether common sends it as a number or a string; the fallback when absent or unreadable. */
export function settingNumber(settings: CommonSettings | null | undefined, key: string, fallback: number): number {
  const raw = settings?.config?.[key];
  if (raw == null || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** A boolean setting: true/false or "true"/"false"; the fallback otherwise. */
export function settingFlag(settings: CommonSettings | null | undefined, key: string, fallback: boolean): boolean {
  const raw = settings?.config?.[key];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    if (raw.trim().toLowerCase() === 'true') return true;
    if (raw.trim().toLowerCase() === 'false') return false;
  }
  return fallback;
}

export function settingText(settings: CommonSettings | null | undefined, key: string): string | null {
  const raw = settings?.config?.[key];
  if (raw == null) return null;
  const text = String(raw);
  return text.trim() === '' ? null : text;
}

/** Common's defaults for the MARKETPLACE settings (V24), used when a value is absent. */
export const MP_DEFAULTS = { preparationMinutes: 60, responseSlaSeconds: 60, online: true, directOrdersEnabled: false };

// ── restaurants and outlets ────────────────────────────────────────────

function coordinate(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * An outlet. `state` is the state's name (the code when the list does not know it); `deliveryInstructions` comes from
 * the outlet's MARKETPLACE settings, so it is null when they were not read (the outlet list does not read them).
 */
export function toOutlet(outlet: CommonOutlet, states: GeoState[], settings?: CommonSettings | null): Outlet {
  return {
    id: outlet.id,
    restaurantId: outlet.orgId,
    name: outlet.name,
    addressLine1: outlet.addressLine1 ?? null,
    addressLine2: outlet.addressLine2 ?? null,
    landmark: outlet.landmark ?? null,
    city: outlet.city ?? null,
    state: stateNameFor(states, outlet.stateCode),
    stateCode: outlet.stateCode ?? null,
    pincode: outlet.pincode ?? null,
    latitude: coordinate(outlet.latitude),
    longitude: coordinate(outlet.longitude),
    contactName: outlet.contactName ?? null,
    contactPhone: outlet.contactPhone ?? null,
    deliveryInstructions: settingText(settings, MP_SETTING.deliveryInstructions),
    status: outlet.status,
  };
}

/** The business's GSTIN on file: its active, business-wide GSTIN identifier (an outlet's own is not the business's). */
export function activeGstin(identifiers: CommonIdentifier[] | null | undefined): CommonIdentifier | null {
  return (identifiers ?? []).find((i) => i.idType === 'GSTIN' && i.status === 'ACTIVE' && i.outletId == null)
    ?? null;
}

export function toRestaurant(org: CommonOrg, states: GeoState[], identifiers: CommonIdentifier[]): Restaurant {
  return {
    id: org.id,
    name: org.displayName,
    legalName: org.legalName ?? null,
    gstin: activeGstin(identifiers)?.idValue ?? null,
    status: org.status,
    outlets: (org.outlets ?? []).map((o) => toOutlet(o, states)),
  };
}

// ── suppliers and stores ───────────────────────────────────────────────

/**
 * What the supplier screens call a store's status: common's own status when the store is not ACTIVE there (closed,
 * suspended), else OFFLINE when its MARKETPLACE `online` setting is false, else ACTIVE. Mirrors
 * `SupplierStanding.storeStatus` in the Marketplace API.
 */
export function storeStatus(commonStatus: string, online: boolean): string {
  if (commonStatus !== 'ACTIVE') return commonStatus;
  return online ? 'ACTIVE' : 'OFFLINE';
}

/**
 * A store. With its settings, every field is filled from common; without them (a list built from the business and
 * the standing endpoint), status comes from the standing's store and the settings-only fields carry common's defaults
 * until the store's own screen reads them.
 */
export function toSupplierStore(
  store: CommonOutlet,
  states: GeoState[],
  settings: CommonSettings | null,
  standing?: SupplierStanding['stores'][number] | null,
): SupplierStore {
  const online = settingFlag(settings, MP_SETTING.online, MP_DEFAULTS.online);
  return {
    id: store.id,
    supplierOrganizationId: store.orgId,
    name: store.name,
    addressLine1: store.addressLine1 ?? null,
    addressLine2: store.addressLine2 ?? null,
    city: store.city ?? null,
    state: stateNameFor(states, store.stateCode),
    stateCode: store.stateCode ?? null,
    pincode: store.pincode ?? null,
    latitude: coordinate(store.latitude) == null ? null : String(store.latitude),
    longitude: coordinate(store.longitude) == null ? null : String(store.longitude),
    contactName: store.contactName ?? null,
    contactPhone: store.contactPhone ?? null,
    operatingHours: fromCommonHours(store.operatingHours),
    responseSlaSeconds: settingNumber(settings, MP_SETTING.responseSlaSeconds, MP_DEFAULTS.responseSlaSeconds),
    preparationMinutes: settingNumber(settings, MP_SETTING.preparationMinutes, MP_DEFAULTS.preparationMinutes),
    directOrdersEnabled: settingFlag(settings, MP_SETTING.directOrdersEnabled, MP_DEFAULTS.directOrdersEnabled),
    status: settings != null || standing == null ? storeStatus(store.status, online) : standing.status,
  };
}

/** A supplier: the business from common, its standing (lifecycle, verification, canTrade) from the Marketplace API. */
export function toSupplier(
  org: CommonOrg,
  standing: SupplierStanding,
  identifiers: CommonIdentifier[],
  states: GeoState[],
): Supplier {
  const standingStores = new Map(standing.stores.map((s) => [s.id, s]));
  return {
    id: org.id,
    legalName: org.legalName ?? org.displayName,
    displayName: org.displayName,
    gstin: activeGstin(identifiers)?.idValue ?? null,
    contactName: org.contactName ?? null,
    contactPhone: org.contactPhone ?? null,
    contactEmail: org.contactEmail ?? null,
    lifecycleStatus: standing.lifecycleStatus,
    verificationStatus: standing.verificationStatus,
    canTrade: standing.canTrade,
    stores: (org.outlets ?? [])
      // A CLOSED store is gone for good, for the marketplace too.
      .filter((o) => o.status !== 'CLOSED')
      .map((o) => toSupplierStore(o, states, null, standingStores.get(o.id) ?? null)),
  };
}

// ── writes ─────────────────────────────────────────────────────────────

/** The address and contact fields the app edits, as the strings its forms hold. */
export interface PlaceFields {
  kind?: 'OUTLET' | 'STORE';
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  pincode?: string;
  latitude?: string;
  longitude?: string;
  googlePlaceId?: string;
  formattedAddress?: string;
  contactName?: string;
  contactPhone?: string;
}

/**
 * Common's `OutletInput` for those fields. Absent stays absent (unchanged on PATCH); coordinates are sent as numbers
 * and only when both read as numbers, so a half-typed pin is not saved.
 */
export function toOutletInput(fields: PlaceFields, stateCode?: string | null): CommonOutletInput {
  const out: CommonOutletInput = {};
  if (fields.kind) out.kind = fields.kind;
  const text: (keyof PlaceFields & keyof CommonOutletInput)[] = [
    'name', 'addressLine1', 'addressLine2', 'landmark', 'city', 'pincode', 'googlePlaceId', 'formattedAddress',
    'contactName', 'contactPhone',
  ];
  text.forEach((key) => {
    const value = fields[key];
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  });
  if (stateCode) out.stateCode = stateCode;
  const lat = coordinate(fields.latitude);
  const lng = coordinate(fields.longitude);
  if (lat != null && lng != null) {
    out.latitude = lat;
    out.longitude = lng;
  }
  return out;
}
