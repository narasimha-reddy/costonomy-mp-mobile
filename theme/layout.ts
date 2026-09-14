import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Control sizing.
 *
 * `TouchTarget.min` is 44 because PRD §23A.48 / §05-mobile-screens §36 require a
 * 44x44pt minimum. Where a control is visually smaller than that — a quantity
 * stepper's −/+, a chip's dismiss — it must still claim 44pt of touch area via
 * `hitSlop`. `hitSlopFor()` computes that padding for you.
 */
export const ControlHeight = {
  /** Dense rows: filter chips, inline actions. */
  sm: 32,
  /** Secondary buttons, dropdowns, search bar. */
  md: 44,
  /** Primary CTAs. */
  lg: 52,
} as const;

export const IconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  /** Empty-state and error-state illustrations. */
  hero: 40,
} as const;

export const TouchTarget = {
  min: 44,
} as const;

/**
 * Padding that grows a visually-small control to the 44pt minimum touch target.
 * Returns a value for the `hitSlop` prop.
 *
 *   <Pressable hitSlop={hitSlopFor(24)} />   // a 24pt icon gets 10pt all round
 */
export function hitSlopFor(renderedSize: number): number {
  return Math.max(0, Math.round((TouchTarget.min - renderedSize) / 2));
}

// ── Window size classes ───────────────────────────────────────────────
// Same Material 3 classes costonomy-mobile-app uses, and for the same reason:
// working in dp covers iPad and Android tablets with one rule, and degrades
// correctly for an iPad in Slide Over (~320dp, which should get the phone
// layout). The tablet test uses the *shortest* side so a device's class cannot
// flip mid-rotation.

export const Breakpoints = {
  compact: 0,
  medium: 600,
  expanded: 840,
} as const;

export type SizeClass = 'compact' | 'medium' | 'expanded';

/** Max content width per class. `null` on compact = full width, i.e. phones are untouched. */
export const ContentMaxWidth: Record<SizeClass, number | null> = {
  compact: null,
  medium: 720,
  expanded: 900,
};

/** Horizontal gutter per class. `compact` matches Spacing.screenHorizontal. */
export const Gutter: Record<SizeClass, number> = {
  compact: 16,
  medium: 24,
  expanded: 32,
};

export const SHEET_MAX_WIDTH_TABLET = 560;

/** Pure classification from raw dimensions. Safe to unit test. */
export function sizeClassFor(width: number, height: number): SizeClass {
  const shortSide = Math.min(width, height);
  if (shortSide < Breakpoints.medium) return 'compact';
  if (shortSide < Breakpoints.expanded) return 'medium';
  return 'expanded';
}

/**
 * The class the app should lay out for. **Use this, not `sizeClassFor`.**
 * Always `compact` on web, where the browser window is not the layout.
 */
export function windowSizeClass(width: number, height: number): SizeClass {
  if (Platform.OS === 'web') return 'compact';
  return sizeClassFor(width, height);
}

export const Layout = {
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  isSmallDevice: SCREEN_WIDTH < 375,
  tabBarHeight: 60,
  headerHeight: Platform.OS === 'ios' ? 44 : 56,
  /** Height reserved for the sticky bottom CTA bar on cart/checkout. */
  stickyBarHeight: 76,
} as const;
