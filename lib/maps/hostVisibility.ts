/**
 * Is a map's host element on screen? The tile watchdog asks before it starts its clock.
 *
 * <p>A screen further down the navigation stack stays mounted but hidden (display:none, zero size). A Google map
 * created there never draws tiles, so its watchdog must not run: it would time out and blame the key.
 *
 * <p>Anything that is not a DOM element (tests, native) cannot be measured and counts as shown, which keeps the
 * old behaviour there.
 */
type Measurable = {
  getBoundingClientRect?: () => { width: number; height: number };
  getClientRects?: () => { length: number };
};

export function hostShown(node: unknown): boolean {
  const el = node as Measurable | null;
  if (el == null || typeof el.getBoundingClientRect !== 'function') return true;
  // display:none on the element or any ancestor leaves no client rects and a 0x0 box.
  if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Calls `onChange` whenever the host's size changes, which includes it being hidden (size 0) and shown again.
 * Returns the unsubscribe. Without ResizeObserver, or for a non-DOM node, nothing is watched.
 */
export function watchHost(node: unknown, onChange: () => void): () => void {
  const Observer = (globalThis as { ResizeObserver?: new (cb: () => void) => { observe: (n: unknown) => void; disconnect: () => void } })
    .ResizeObserver;
  const el = node as Measurable | null;
  if (!Observer || el == null || typeof el.getBoundingClientRect !== 'function') return () => undefined;
  try {
    const ro = new Observer(onChange);
    ro.observe(node);
    return () => ro.disconnect();
  } catch {
    return () => undefined;
  }
}

/**
 * True when Google has painted tiles into the host: a raster tile image from Google's tile servers or a drawn
 * vector canvas. Checked when the watchdog would fire, so a missed `tilesloaded` event cannot fail a working map.
 */
export function hostHasTiles(node: unknown): boolean {
  const el = node as { querySelectorAll?: (s: string) => ArrayLike<{ src?: string; width?: number; height?: number }> } | null;
  if (el == null || typeof el.querySelectorAll !== 'function') return false;
  try {
    const imgs = Array.from(el.querySelectorAll('.gm-style img'));
    if (imgs.some((i) => /googleapis\.com\/maps\/vt|\/maps\/vt\?|khms?\d*\.google/.test(String(i.src ?? '')))) return true;
    const canvases = Array.from(el.querySelectorAll('.gm-style canvas'));
    return canvases.some((c) => (c.width ?? 0) > 0 && (c.height ?? 0) > 0);
  } catch {
    return false;
  }
}
