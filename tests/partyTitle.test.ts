import { partyTitle } from '@/lib/supplier/partyTitle';

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
