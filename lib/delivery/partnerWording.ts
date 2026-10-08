/**
 * Customer-visible text says "delivery partner", never "driver". Some hints come from the server worded with
 * "driver" ("Driver running late or GPS stale. Call driver"); this rewords them for display only.
 */
export function partnerWording(text: string): string {
  return text.replace(/\bDriver\b/g, 'Delivery partner').replace(/\bdriver\b/g, 'delivery partner');
}
