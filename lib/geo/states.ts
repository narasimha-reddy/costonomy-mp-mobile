import { commonRequest } from '@/lib/api/common';
import { ApiError } from '@/lib/api/errors';

/**
 * Indian states as costonomy-common-api lists them (`GET /v1/geo/states`, public).
 *
 * <p>Common stores an outlet's state as its ISO code (`IN-TG`); people read and type names. The app shows names and
 * sends codes, and these are the only places the two are converted.
 */
export interface GeoState {
  /** ISO 3166-2, e.g. `IN-TG`. What common stores. */
  code: string;
  name: string;
  countryCode?: string;
  gstStateCode?: string | null;
}

let cached: Promise<GeoState[]> | null = null;

/** The list, fetched once per app run. A failed fetch is not cached, so the next caller asks again. */
export function fetchStates(): Promise<GeoState[]> {
  if (!cached) {
    cached = commonRequest<{ items: GeoState[] }>('/v1/geo/states')
      .then((body) => body?.items ?? [])
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

/** For tests. */
export function resetStatesCache(): void {
  cached = null;
}

function fold(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The code for what someone typed: a state's name (any case, spacing or punctuation: "tamil nadu", "Tamil-Nadu"),
 * or a code itself (`IN-TN`, `in-tn`). Null when nothing matches; the screen then asks for a state from the list
 * rather than guessing.
 */
export function stateCodeFor(states: GeoState[], input: string | null | undefined): string | null {
  const wanted = fold(input ?? '');
  if (wanted === '') return null;
  const byName = states.find((s) => fold(s.name) === wanted);
  if (byName) return byName.code;
  const byCode = states.find((s) => fold(s.code) === wanted);
  return byCode ? byCode.code : null;
}

/** The name for a stored code; the code itself when the list does not have it, so nothing on file is hidden. */
export function stateNameFor(states: GeoState[], code: string | null | undefined): string | null {
  if (code == null || code.trim() === '') return null;
  return states.find((s) => s.code.toUpperCase() === code.trim().toUpperCase())?.name ?? code;
}

/** States whose name contains what was typed, for the suggestions under a state field. Empty input: none. */
export function matchingStates(states: GeoState[], input: string, limit = 6): GeoState[] {
  const wanted = fold(input);
  if (wanted === '') return [];
  const starts = states.filter((s) => fold(s.name).startsWith(wanted));
  const contains = states.filter((s) => !fold(s.name).startsWith(wanted) && fold(s.name).includes(wanted));
  return [...starts, ...contains].slice(0, limit);
}

/**
 * The states, or an empty list when common cannot be reached. Reads (mapping a stored code to a name) degrade to
 * showing the code; writes resolve through {@link requireStateCode}, which does not degrade.
 */
export async function statesOrEmpty(): Promise<GeoState[]> {
  try {
    return await fetchStates();
  } catch {
    return [];
  }
}

/**
 * The code to send for a state the person typed or picked. Refuses, in the API's own error shape, when the name is not
 * one of common's states, so a typo is never saved as a different state or dropped.
 */
export async function requireStateCode(input: string | null | undefined): Promise<string> {
  const code = stateCodeFor(await fetchStates(), input);
  if (code == null) {
    throw new ApiError({
      code: 'VALIDATION_FAILED',
      message: 'Choose your state from the list.',
      status: 400,
      details: { field: 'stateCode' },
    });
  }
  return code;
}
