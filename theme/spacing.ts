/**
 * Spacing, radii and elevation. 4-point scale, same values as costonomy-mobile-app.
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,

  /** The single horizontal gutter every screen uses. Do not vary it per screen. */
  screenHorizontal: 16,
  screenVertical: 16,
  cardPadding: 16,
  cardPaddingCompact: 12,
  /** Gap between cards in a vertical feed. */
  listGap: 12,
  /** Gap between sections on Home. */
  sectionGap: 24,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  /** Pills: chips, badges, the primary CTA. */
  full: 9999,
} as const;

/**
 * Elevation. Named for the role, not the depth, so a component cannot pick
 * "the slightly stronger shadow" and drift out of the system.
 *
 * `elevation` (Android) and the iOS shadow props are tuned to look equivalent
 * rather than to hold the same numeric value.
 */
export const Elevation = {
  /** Resting cards in a feed. */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  /** Cards that need to separate from a busy background, sticky summary bars. */
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  /** Bottom sheets and modals. */
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  /** Floating action button, the sticky "Proceed to checkout" bar. */
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;

export type ElevationToken = keyof typeof Elevation;
