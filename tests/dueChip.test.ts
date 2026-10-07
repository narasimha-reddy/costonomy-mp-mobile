import { dueChip } from '@/lib/credit/dueChip';

describe('dueChip', () => {
  it('words each fixed state with its tone', () => {
    expect(dueChip('OVERDUE', -3)).toEqual({ label: 'Overdue', tone: 'danger' });
    expect(dueChip('IN_GRACE', -1)).toEqual({ label: 'Past due', tone: 'warning' });
    expect(dueChip('DUE_TODAY', 0)).toEqual({ label: 'Due today', tone: 'warning' });
    expect(dueChip('PAID', null)).toEqual({ label: 'Paid', tone: 'success' });
    expect(dueChip('WRITTEN_OFF', null)).toEqual({ label: 'Written off', tone: 'neutral' });
  });

  it('DUE_SOON counts days, with tomorrow for one', () => {
    expect(dueChip('DUE_SOON', 1)).toEqual({ label: 'Due tomorrow', tone: 'warning' });
    expect(dueChip('DUE_SOON', 2)).toEqual({ label: 'Due in 2 days', tone: 'warning' });
  });

  it('DUE_LATER is neutral and pluralises', () => {
    expect(dueChip('DUE_LATER', 30)).toEqual({ label: 'Due in 30 days', tone: 'neutral' });
    expect(dueChip('DUE_LATER', 1)).toEqual({ label: 'Due tomorrow', tone: 'neutral' });
    expect(dueChip('DUE_LATER', 2)?.label).toBe('Due in 2 days');
  });

  it('drops the number when daysToDue is null', () => {
    expect(dueChip('DUE_LATER', null)).toEqual({ label: 'Due later', tone: 'neutral' });
    expect(dueChip('DUE_SOON', null)?.label).toBe('Due soon');
    expect(dueChip('DUE_LATER', undefined)?.label).toBe('Due later');
  });

  it('claims nothing for an unknown or missing state', () => {
    expect(dueChip('SOMETHING_NEW', 3)).toBeNull();
    expect(dueChip(undefined, 3)).toBeNull();
    expect(dueChip(null, null)).toBeNull();
  });
});
