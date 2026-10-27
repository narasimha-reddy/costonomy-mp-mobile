/**
 * costonomy-common-api's business and outlet records, as its `/v1/orgs` and `/v1/outlets` endpoints answer them
 * (`OrgFacade.OrgView` / `OutletView`). Common owns restaurants, outlets, suppliers and stores (Marketplace API D-208,
 * common D-85); the app reads and writes them there and maps them to its own `Restaurant`, `Outlet`, `Supplier` and
 * `SupplierStore` in `lib/org/mapping.ts`.
 */

export type OrgType = 'RESTAURANT' | 'SUPPLIER';
export type OutletKind = 'OUTLET' | 'STORE';

export interface CommonOutlet {
  id: number;
  orgId: number;
  kind: OutletKind | string;
  name: string;
  code?: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  locality?: string | null;
  city: string | null;
  /** ISO 3166-2, e.g. `IN-TG`. */
  stateCode: string | null;
  pincode: string | null;
  countryCode?: string | null;
  /** BigDecimal on the server: a JSON number. */
  latitude: number | string | null;
  longitude: number | string | null;
  googlePlaceId?: string | null;
  formattedAddress?: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail?: string | null;
  /** `{"mon": [["09:00", "21:00"]], …}`; absent day = closed. */
  operatingHours?: unknown;
  /** ACTIVE, INACTIVE, CLOSED or SUSPENDED. */
  status: string;
}

export interface CommonEnrollment {
  id: number;
  orgId: number;
  outletId: number | null;
  appCode: string;
  status: string;
  live: boolean;
}

export interface CommonOrg {
  id: number;
  orgType: OrgType | string;
  displayName: string;
  legalName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  claimStatus?: string | null;
  verificationStatus?: string | null;
  status: string;
  outlets?: CommonOutlet[] | null;
  enrollments?: CommonEnrollment[] | null;
}

/** `POST /v1/orgs/{id}/identifiers` and its list. */
export interface CommonIdentifier {
  id: number;
  orgId: number;
  outletId: number | null;
  idType: string;
  idValue: string;
  legalNameOnRecord?: string | null;
  /** UNVERIFIED, PENDING, VERIFIED, REJECTED … */
  verificationStatus: string;
  /** ACTIVE, or DELETED once removed. */
  status: string;
}

/** `GET /v1/outlets/{id}/settings?app=MARKETPLACE`. Values arrive typed by common's catalogue, or as strings. */
export interface CommonSettings {
  config: Record<string, unknown>;
  updatedTs?: string | null;
}

/** `OutletInput`: every field optional; null or absent leaves it unchanged on PATCH. */
export interface CommonOutletInput {
  kind?: OutletKind;
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  stateCode?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  formattedAddress?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  operatingHours?: Record<string, string[][]>;
}

/** `OrgInput`: null or absent leaves a field unchanged on PATCH. */
export interface CommonOrgInput {
  displayName?: string;
  legalName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

/**
 * The Marketplace API's `GET /api/v1/suppliers/{id}/standing`: what the marketplace makes of a supplier that common
 * holds. Lifecycle and `canTrade` are read here, never computed in the app.
 */
export interface SupplierStanding {
  supplierId: number;
  /** INVITED, REGISTERED, VERIFICATION_PENDING, VERIFIED, ACTIVE or SUSPENDED. */
  lifecycleStatus: string;
  /** NOT_SUBMITTED, PENDING, VERIFIED, REJECTED or INFORMATION_REQUESTED. */
  verificationStatus: string;
  canTrade: boolean;
  stores: { id: number; name: string; status: string; takesOrders: boolean }[];
}

/** Marketplace's own outlet and store settings in common (D-85), by key. */
export const MP_SETTING = {
  deliveryInstructions: 'deliveryInstructions',
  preparationMinutes: 'preparationMinutes',
  online: 'online',
  directOrdersEnabled: 'directOrdersEnabled',
  /** Costonomy-only: read-only in the app. */
  responseSlaSeconds: 'responseSlaSeconds',
  /** Costonomy-only: read-only in the app. */
  chatEnabled: 'chatEnabled',
} as const;
