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

/**
 * The same names split for a narrow header: the restaurant as the title and the outlet on its own line, so a long
 * "Restaurant · Outlet" is not cut at 360 px. `outlet` is null when there is nothing distinct to show.
 */
export function partyHeading(
  restaurantName: string | null | undefined,
  outletName: string | null | undefined,
  fallback = '',
): { title: string; outlet: string | null } {
  const restaurant = restaurantName?.trim() ?? '';
  const outlet = outletName?.trim() ?? '';
  if (restaurant !== '' && outlet !== '' && restaurant.toLowerCase() !== outlet.toLowerCase()) {
    return { title: restaurant, outlet };
  }
  return { title: restaurant || outlet || fallback, outlet: null };
}
