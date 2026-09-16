/**
 * What to call this store, given that the business is named underneath it.
 *
 * <p>Stores are usually named "<business> <place>", so putting the store on top
 * and the business below says the business twice — and at 390pt the repetition
 * is what pushes the useful half off the end: "Metro Fresh Supplies Koram…" over
 * "Metro Fresh Supplies". Dropping the prefix leaves "Koramangala", which is the
 * part that distinguishes this store from the others.
 *
 * <p>Falls back to the full name whenever stripping would leave nothing, or
 * leave something too short to mean anything — a store genuinely called the same
 * as its business keeps its name rather than becoming blank.
 */
export function storeLabel(storeName?: string | null, business?: string | null): string | null {
  if (!storeName) return null;
  if (!business) return storeName;

  const lower = storeName.toLowerCase();
  const prefix = business.toLowerCase();
  if (!lower.startsWith(prefix)) return storeName;

  const remainder = storeName.slice(business.length).replace(/^[\s—–-]+/, '').trim();
  return remainder.length >= 2 ? remainder : storeName;
}

