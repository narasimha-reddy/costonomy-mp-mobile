import { commonRequest } from '@/lib/api/common';
import { ApiError } from '@/lib/api/errors';
import {
  fetchStates,
  matchingStates,
  requireStateCode,
  resetStatesCache,
  stateCodeFor,
  stateNameFor,
  type GeoState,
} from '@/lib/geo/states';

jest.mock('@/lib/api/common', () => ({ commonRequest: jest.fn() }));

const STATES: GeoState[] = [
  { code: 'IN-KA', name: 'Karnataka' },
  { code: 'IN-TG', name: 'Telangana' },
  { code: 'IN-TN', name: 'Tamil Nadu' },
  { code: 'IN-JK', name: 'Jammu and Kashmir' },
];

describe('state name and code (common stores the ISO code)', () => {
  it('finds the code for a name however it was typed', () => {
    expect(stateCodeFor(STATES, 'Telangana')).toBe('IN-TG');
    expect(stateCodeFor(STATES, '  tamil nadu ')).toBe('IN-TN');
    expect(stateCodeFor(STATES, 'Tamil-Nadu')).toBe('IN-TN');
  });

  it('accepts a code as well', () => {
    expect(stateCodeFor(STATES, 'in-ka')).toBe('IN-KA');
  });

  it('answers null for anything that is not a state, rather than guessing', () => {
    expect(stateCodeFor(STATES, 'Telanga')).toBeNull();
    expect(stateCodeFor(STATES, '')).toBeNull();
    expect(stateCodeFor(STATES, null)).toBeNull();
    expect(stateCodeFor([], 'Telangana')).toBeNull();
  });

  it('names a stored code, and shows the code when the list does not know it', () => {
    expect(stateNameFor(STATES, 'IN-TG')).toBe('Telangana');
    expect(stateNameFor(STATES, 'in-tg')).toBe('Telangana');
    expect(stateNameFor(STATES, 'IN-XX')).toBe('IN-XX');
    expect(stateNameFor(STATES, null)).toBeNull();
  });

  it('suggests names that start with what was typed first, then names that contain it', () => {
    expect(matchingStates(STATES, 'ta').map((s) => s.name)).toEqual(['Tamil Nadu', 'Karnataka']);
    expect(matchingStates(STATES, 'kash').map((s) => s.name)).toEqual(['Jammu and Kashmir']);
    expect(matchingStates(STATES, '')).toEqual([]);
  });
});

describe('fetching the list', () => {
  beforeEach(() => {
    resetStatesCache();
    (commonRequest as jest.Mock).mockReset();
  });

  it('asks common once and reuses the answer', async () => {
    (commonRequest as jest.Mock).mockResolvedValue({ items: STATES });
    await fetchStates();
    await fetchStates();
    expect(commonRequest).toHaveBeenCalledTimes(1);
    expect(commonRequest).toHaveBeenCalledWith('/v1/geo/states');
  });

  it('asks again after a failure', async () => {
    (commonRequest as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ items: STATES });
    await expect(fetchStates()).rejects.toThrow('offline');
    await expect(fetchStates()).resolves.toEqual(STATES);
  });

  it('refuses to send a state that is not on the list', async () => {
    (commonRequest as jest.Mock).mockResolvedValue({ items: STATES });
    await expect(requireStateCode('Karnataka')).resolves.toBe('IN-KA');
    await expect(requireStateCode('Atlantis')).rejects.toBeInstanceOf(ApiError);
  });
});
