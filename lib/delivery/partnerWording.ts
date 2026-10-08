/**
 * Customer-visible text says "delivery partner", never "driver", "rider" or "courier". Some server text uses those
 * words ("Driver running late or GPS stale. Call driver", "Rider app timed out"); this rewords it for display only.
 */
export function partnerWording(text: string): string {
  return text
    .replace(/\b(Driver|Rider|Courier)(s?)\b/g, (_m, _w, plural: string) => `Delivery partner${plural}`)
    .replace(/\b(driver|rider|courier)(s?)\b/g, (_m, _w, plural: string) => `delivery partner${plural}`);
}
