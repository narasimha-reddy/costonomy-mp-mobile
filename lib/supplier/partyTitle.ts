/**
 * The title a supplier sees for the kitchen they are dealing with: the restaurant's name, then the outlet. A locality
 * alone ("Indiranagar") told the supplier where, never who.
 */
export function partyTitle(
  restaurantName: string | null | undefined,
  outletName: string | null | undefined,
  fallback = '',
): string {
  const restaurant = restaurantName?.trim() ?? '';
  const outlet = outletName?.trim() ?? '';
  if (restaurant !== '' && outlet !== '' && restaurant.toLowerCase() !== outlet.toLowerCase()) {
    return `${restaurant} · ${outlet}`;
  }
  return restaurant || outlet || fallback;
}
