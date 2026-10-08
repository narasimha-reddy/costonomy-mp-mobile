import { partyHeading, partyTitle } from '@/lib/supplier/partyTitle';

describe('who a supplier is dealing with', () => {
  it('names the restaurant first and the outlet after it', () => {
    expect(partyTitle('Spice Garden', 'Indiranagar')).toBe('Spice Garden · Indiranagar');
  });

  it('does not repeat a name that is the same twice', () => {
    expect(partyTitle('Spice Garden', 'Spice Garden')).toBe('Spice Garden');
  });

  it('falls back to whichever name exists, or the given fallback', () => {
    expect(partyTitle(null, 'Indiranagar')).toBe('Indiranagar');
    expect(partyTitle('Spice Garden', null)).toBe('Spice Garden');
    expect(partyTitle(null, null, 'The restaurant')).toBe('The restaurant');
    expect(partyTitle('  ', '', undefined)).toBe('');
  });
});

describe('heading split for a narrow header', () => {
  it('puts the restaurant in the title and the outlet in the subtitle', () => {
    expect(partyHeading('Spice Garden', 'Indiranagar')).toEqual({ title: 'Spice Garden', outlet: 'Indiranagar' });
  });

  it('has no outlet line when the names match or one is missing', () => {
    expect(partyHeading('Spice Garden', 'spice garden')).toEqual({ title: 'Spice Garden', outlet: null });
    expect(partyHeading('Spice Garden', null)).toEqual({ title: 'Spice Garden', outlet: null });
    expect(partyHeading(null, 'Indiranagar')).toEqual({ title: 'Indiranagar', outlet: null });
    expect(partyHeading(null, null, 'Request')).toEqual({ title: 'Request', outlet: null });
  });
});
