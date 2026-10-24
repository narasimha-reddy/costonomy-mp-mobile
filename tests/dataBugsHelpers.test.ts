import { partnerDisplayName } from '@/lib/delivery/deliveryPartner';
import { gstinBadge } from '@/lib/supplier/gstinBadge';
import { storeHoursLine } from '@/lib/supplier/storeHours';

describe('partnerDisplayName', () => {
  it('keeps a real name, trimmed', () => {
    expect(partnerDisplayName('  Ravi Kumar ')).toBe('Ravi Kumar');
  });
  it.each([null, undefined, '', '   ', 'Rider name', 'rider name', 'Driver Name', 'Name', 'N/A', 'null', 'undefined', 'Unknown'])(
    'treats %p as no name', (value) => {
      expect(partnerDisplayName(value as string | null | undefined)).toBeNull();
    });
  it('does not drop a real name that merely contains a placeholder word', () => {
    expect(partnerDisplayName('Rider Singh')).toBe('Rider Singh');
  });
});

describe('gstinBadge', () => {
  it('is verified only with a GSTIN and a VERIFIED status', () => {
    expect(gstinBadge('29ABCDE1234F1Z5', 'VERIFIED')).toEqual({ kind: 'verified', label: 'verified', tone: 'success' });
  });
  it('shows the server status, not "verified", for a GSTIN that is not verified', () => {
    expect(gstinBadge('29ABCDE1234F1Z5', 'PENDING_REVIEW')).toEqual({ kind: 'status', label: 'pending review', tone: 'pending' });
  });
  it('never says verified without a GSTIN, even when the status says VERIFIED', () => {
    expect(gstinBadge(null, 'VERIFIED')).toEqual({ kind: 'add', label: 'Add GSTIN', tone: 'neutral' });
    expect(gstinBadge('  ', 'VERIFIED').kind).toBe('add');
  });
});

describe('storeHoursLine', () => {
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  it('reads days and times', () => {
    expect(storeHoursLine({ days, opensAt: '10:00', closesAt: '21:00' })).toBe('Every day · 10:00–21:00');
    expect(storeHoursLine({ days: days.slice(0, 6), opensAt: '09:00', closesAt: '18:00' })).toBe('Mon–Sat · 09:00–18:00');
  });
  it('treats identical open and close as not set', () => {
    expect(storeHoursLine({ days, opensAt: '00:00', closesAt: '00:00' })).toBe('Hours not set');
    expect(storeHoursLine({ days, opensAt: '10:00', closesAt: '10:00' })).toBe('Hours not set');
  });
  it('is not set when there are no hours or no days', () => {
    expect(storeHoursLine(null)).toBe('Hours not set');
    expect(storeHoursLine({ days: [], opensAt: '10:00', closesAt: '21:00' })).toBe('No days set');
  });
});
