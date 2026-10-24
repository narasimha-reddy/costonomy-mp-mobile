import { hoursAreSet } from '@/lib/supplier/storeHours';
import { creditNotesNotice } from '@/lib/billing/messages';
import { ApiError } from '@/lib/api/errors';
import { orderTrackingView } from '@/lib/delivery/orderTracking';

const NOW = Date.parse('2026-01-01T10:00:00Z');
const pickupOrder = (status: string) => ({
  status, deliveryMode: 'PICKUP', orderNumber: 'ORD-79', supplierName: 'Fresh Farms', storeName: 'FF', outletName: 'Cafe',
});
const days = ['MONDAY'];

describe('hoursAreSet', () => {
  it('is false for the unset 00:00-00:00 and for equal times, true for a window', () => {
    expect(hoursAreSet({ days, opensAt: '00:00', closesAt: '00:00' })).toBe(false);
    expect(hoursAreSet({ days, opensAt: '10:00', closesAt: '10:00' })).toBe(false);
    expect(hoursAreSet({ days, opensAt: '10:00', closesAt: '21:00' })).toBe(true);
    expect(hoursAreSet(null)).toBe(false);
  });
});

describe('creditNotesNotice', () => {
  it('reads the server 404 (tax invoices off) as nothing issued yet', () => {
    const err = new ApiError({ status: 404, code: 'NOT_FOUND', message: 'TaxInvoice not found' });
    expect(creditNotesNotice(err)).toBe('No credit notes yet.');
  });
  it('shows a real failure as a failure', () => {
    const err = new ApiError({ status: 500, code: 'X', message: 'Boom' });
    expect(creditNotesNotice(err)).toBe('Boom');
    expect(creditNotesNotice(new TypeError('net'))).toBe('Could not load credit notes for this order.');
  });
});

describe('a finished pickup order', () => {
  it('does not claim to be at the Ready step', () => {
    const done = orderTrackingView({ audience: 'supplier', order: pickupOrder('COMPLETED') as never, delivery: null, nowMs: NOW });
    expect(done.stepLine).toBe('Step 3 of 3 · Collected');
    expect(done.nextLine).toBe('Complete');
  });
  it('a pickup still waiting to be collected stays at Ready', () => {
    const waiting = orderTrackingView({ audience: 'supplier', order: pickupOrder('READY_FOR_PICKUP') as never, delivery: null, nowMs: NOW });
    expect(waiting.stepLine).toBe('Step 3 of 3 · Ready');
  });
});
