import {
  activeGstin,
  settingFlag,
  settingNumber,
  storeStatus,
  toOutlet,
  toOutletInput,
  toRestaurant,
  toSupplier,
  toSupplierStore,
} from '@/lib/org/mapping';
import type { CommonIdentifier, CommonOrg, CommonOutlet, SupplierStanding } from '@/lib/org/types';
import type { GeoState } from '@/lib/geo/states';

const STATES: GeoState[] = [{ code: 'IN-KA', name: 'Karnataka' }, { code: 'IN-TG', name: 'Telangana' }];

function outlet(over: Partial<CommonOutlet> = {}): CommonOutlet {
  return {
    id: 11,
    orgId: 3,
    kind: 'OUTLET',
    name: 'Indiranagar',
    addressLine1: '100 Feet Road',
    addressLine2: null,
    landmark: 'Near the metro',
    city: 'Bengaluru',
    stateCode: 'IN-KA',
    pincode: '560038',
    latitude: 12.9784,
    longitude: 77.6408,
    contactName: 'Asha',
    contactPhone: '+919876500004',
    operatingHours: null,
    status: 'ACTIVE',
    ...over,
  };
}

function gstin(over: Partial<CommonIdentifier> = {}): CommonIdentifier {
  return {
    id: 90, orgId: 3, outletId: null, idType: 'GSTIN', idValue: '29ABCDE1234F1Z5', verificationStatus: 'UNVERIFIED',
    status: 'ACTIVE', ...over,
  };
}

describe('common outlet → app Outlet', () => {
  it('maps the business id to restaurantId and the state code to its name', () => {
    const mapped = toOutlet(outlet(), STATES, { config: { deliveryInstructions: 'Ring twice' } });
    expect(mapped).toEqual({
      id: 11,
      restaurantId: 3,
      name: 'Indiranagar',
      addressLine1: '100 Feet Road',
      addressLine2: null,
      landmark: 'Near the metro',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: 'IN-KA',
      pincode: '560038',
      latitude: 12.9784,
      longitude: 77.6408,
      contactName: 'Asha',
      contactPhone: '+919876500004',
      deliveryInstructions: 'Ring twice',
      status: 'ACTIVE',
    });
  });

  it('shows the code when the state list is unavailable, and no instructions without settings', () => {
    const mapped = toOutlet(outlet({ latitude: '12.5', longitude: null }), []);
    expect(mapped.state).toBe('IN-KA');
    expect(mapped.latitude).toBe(12.5);
    expect(mapped.longitude).toBeNull();
    expect(mapped.deliveryInstructions).toBeNull();
  });
});

describe('common business → app Restaurant', () => {
  it('names it by its display name and takes the business-wide active GSTIN', () => {
    const org: CommonOrg = {
      id: 3, orgType: 'RESTAURANT', displayName: 'Spice Garden', legalName: null, contactName: null,
      contactPhone: null, contactEmail: null, status: 'ACTIVE', outlets: [outlet()],
    };
    const identifiers = [
      gstin({ id: 1, status: 'DELETED', idValue: '29OLDXX1234F1Z5' }),
      gstin({ id: 2, outletId: 11, idValue: '29OUTLT1234F1Z5' }),
      gstin({ id: 3 }),
    ];
    const restaurant = toRestaurant(org, STATES, identifiers);
    expect(restaurant).toMatchObject({ id: 3, name: 'Spice Garden', legalName: null, gstin: '29ABCDE1234F1Z5' });
    expect(restaurant.outlets.map((o) => o.state)).toEqual(['Karnataka']);
    expect(activeGstin([])).toBeNull();
  });
});

describe('common store + settings → app SupplierStore', () => {
  it('reads the marketplace settings, whether typed or strings', () => {
    const store = toSupplierStore(
      outlet({ kind: 'STORE', stateCode: 'IN-TG', operatingHours: { mon: [['09:00', '18:00']] } }),
      STATES,
      { config: { online: 'false', preparationMinutes: '45', responseSlaSeconds: 120, directOrdersEnabled: true } },
    );
    expect(store).toMatchObject({
      supplierOrganizationId: 3,
      state: 'Telangana',
      latitude: '12.9784',
      longitude: '77.6408',
      operatingHours: { days: ['MONDAY'], opensAt: '09:00', closesAt: '18:00' },
      preparationMinutes: 45,
      responseSlaSeconds: 120,
      directOrdersEnabled: true,
      status: 'OFFLINE',
    });
  });

  it('uses the marketplace defaults when a setting is absent', () => {
    const store = toSupplierStore(outlet({ kind: 'STORE' }), STATES, { config: {} });
    expect(store).toMatchObject({ preparationMinutes: 60, responseSlaSeconds: 60, directOrdersEnabled: false, status: 'ACTIVE' });
  });

  it('without settings, takes the status the standing reports', () => {
    const store = toSupplierStore(outlet({ kind: 'STORE' }), STATES, null,
      { id: 11, name: 'Indiranagar', status: 'OFFLINE', takesOrders: false });
    expect(store.status).toBe('OFFLINE');
  });

  it('a store not ACTIVE in common keeps common\'s status, whatever `online` says', () => {
    expect(storeStatus('SUSPENDED', true)).toBe('SUSPENDED');
    expect(storeStatus('ACTIVE', false)).toBe('OFFLINE');
    expect(storeStatus('ACTIVE', true)).toBe('ACTIVE');
  });

  it('reads settings leniently', () => {
    expect(settingNumber({ config: { n: 'x' } }, 'n', 7)).toBe(7);
    expect(settingNumber(null, 'n', 7)).toBe(7);
    expect(settingFlag({ config: { f: 'TRUE' } }, 'f', false)).toBe(true);
    expect(settingFlag({ config: { f: 1 } }, 'f', false)).toBe(false);
  });
});

describe('common business + standing → app Supplier', () => {
  const standing: SupplierStanding = {
    supplierId: 3,
    lifecycleStatus: 'VERIFICATION_PENDING',
    verificationStatus: 'PENDING',
    canTrade: false,
    stores: [{ id: 21, name: 'Warehouse', status: 'OFFLINE', takesOrders: false }],
  };

  it('takes lifecycle, verification and canTrade from the standing, never from common', () => {
    const org: CommonOrg = {
      id: 3, orgType: 'SUPPLIER', displayName: 'Metro Fresh', legalName: null, contactName: 'Ravi',
      contactPhone: '+919800000000', contactEmail: null, status: 'ACTIVE', verificationStatus: 'VERIFIED',
      outlets: [
        outlet({ id: 21, kind: 'STORE', name: 'Warehouse' }),
        outlet({ id: 22, kind: 'STORE', name: 'Old depot', status: 'CLOSED' }),
      ],
    };
    const supplier = toSupplier(org, standing, [gstin()], STATES);
    expect(supplier).toMatchObject({
      id: 3,
      displayName: 'Metro Fresh',
      // No legal name on file: the display name, as registration defaults it.
      legalName: 'Metro Fresh',
      gstin: '29ABCDE1234F1Z5',
      contactName: 'Ravi',
      lifecycleStatus: 'VERIFICATION_PENDING',
      verificationStatus: 'PENDING',
      canTrade: false,
    });
    expect(supplier.stores.map((s) => [s.id, s.status])).toEqual([[21, 'OFFLINE']]);
  });
});

describe('app fields → common OutletInput', () => {
  it('sends the state code, numeric coordinates and only the fields given', () => {
    expect(toOutletInput({ name: 'Main', city: 'Pune', latitude: '18.52', longitude: '73.85', addressLine2: '' }, 'IN-MH'))
      .toEqual({ name: 'Main', city: 'Pune', addressLine2: '', stateCode: 'IN-MH', latitude: 18.52, longitude: 73.85 });
  });

  it('drops a half-typed pin rather than saving it', () => {
    expect(toOutletInput({ latitude: '18.52', longitude: '' })).toEqual({});
    expect(toOutletInput({ latitude: 'abc', longitude: '73.85' })).toEqual({});
  });
});
