/**
 * What to call this branch, given that the business is named underneath it.
 *
 * <p>Serves both sides: a supplier's store under its trading name, and a
 * restaurant's outlet under the restaurant's. Both are usually named
 * "<business> <place>", so putting the branch on top and the business below says
 * the business twice — and at 390pt the repetition is what pushes the useful
 * half off the end: "Metro Fresh Supplies Koram…" over "Metro Fresh Supplies".
 * Dropping the prefix leaves "Koramangala", which is the part that distinguishes
 * this branch from the others.
 *
 * <p>Falls back to the full name whenever stripping would leave nothing, or
 * leave something too short to mean anything — a branch genuinely called the
 * same as its business keeps its name rather than becoming blank.
 */
export function placeLabel(place?: string | null, business?: string | null): string | null {
  if (!place) return null;
  if (!business) return place;

  const lower = place.toLowerCase();
  const prefix = business.toLowerCase();
  if (!lower.startsWith(prefix)) return place;

  const remainder = place.slice(business.length).replace(/^[\s—–-]+/, '').trim();
  return remainder.length >= 2 ? remainder : place;
}

