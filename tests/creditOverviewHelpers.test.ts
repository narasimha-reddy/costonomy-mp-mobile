import { allSuspended, compareDues, groupAgreements, owesAnything, rejectionReason } from '@/lib/credit/overview';
import type { CreditAgreement } from '@/models/credit';

const ag = (o: Partial<CreditAgreement>): CreditAgreement => ({
  id: 1, supplierName: 'A', storeName: null, status: 'ACTIVE', due: '0', overdue: '0',
  available: '0', nextDueDate: null, latestRequest: null, ...o,
} as CreditAgreement);

describe('credit overview helpers', () => {
  it('owesAnything is true for due or overdue', () => {
    expect(owesAnything(ag({ due: '5' }))).toBe(true);
    expect(owesAnything(ag({ due: '0.0000', overdue: '0' }))).toBe(false);
  });

  it('sorts overdue first, then next due date, then name', () => {
    const list = [
      ag({ id: 1, supplierName: 'Zed', due: '10', nextDueDate: '2026-09-20' }),
      ag({ id: 2, supplierName: 'Bee', due: '10', nextDueDate: '2026-09-24' }),
      ag({ id: 3, supplierName: 'Cat', due: '10', overdue: '5', nextDueDate: '2026-10-30' }),
      ag({ id: 4, supplierName: 'Abe', due: '10', nextDueDate: '2026-09-20' }),
      ag({ id: 5, supplierName: 'Nodate', due: '10', nextDueDate: null }),
    ];
    expect([...list].sort(compareDues).map((a) => a.id)).toEqual([3, 4, 1, 2, 5]);
  });

  it('groups dues apart from lines', () => {
    const g = groupAgreements([ag({ id: 1, due: '3' }), ag({ id: 2 }), ag({ id: 3, status: 'REQUESTED' })]);
    expect(g.dues.map((a) => a.id)).toEqual([1]);
    expect(g.lines.map((a) => a.id)).toEqual([2, 3]);
  });

  it('allSuspended needs at least one agreement', () => {
    expect(allSuspended([])).toBe(false);
    expect(allSuspended([ag({ status: 'SUSPENDED' }), ag({ status: 'ACTIVE' })])).toBe(false);
    expect(allSuspended([ag({ status: 'SUSPENDED' })])).toBe(true);
  });

  it('rejectionReason reads the latest request note', () => {
    expect(rejectionReason(ag({}))).toBeNull();
    expect(rejectionReason(ag({ latestRequest: { responseNote: 'Too new' } as never }))).toBe('Too new');
  });
});
