/**
 * Mandi type scale.
 *
 * Source Sans 3 throughout, same family and weights as costonomy-mobile-app.
 *
 * Two things here are specific to a commerce app and worth knowing before you
 * use them:
 *
 *  - `TextStyles.price` and the `numeric*` styles set `fontVariant: ['tabular-nums']`.
 *    Prices stacked in a comparison list (§23A.13) or a cart summary (§23A.16)
 *    must align on the decimal point, and proportional digits in Source Sans 3
 *    do not. Any money or quantity rendered in a column uses these.
 *  - Line heights are absolute pixel values, not multipliers. React Native's
 *    `lineHeight` is in px, and a multiplier recomputed at each call site is how
 *    vertical rhythm drifts between screens.
 */
import type { TextStyle } from 'react-native';

export const FontFamily = {
  light: 'SourceSans3_300Light',
  regular: 'SourceSans3_400Regular',
  medium: 'SourceSans3_500Medium',
  semibold: 'SourceSans3_600SemiBold',
  bold: 'SourceSans3_700Bold',
  extrabold: 'SourceSans3_800ExtraBold',
} as const;

/** Raw sizes. Identical to costonomy-mobile-app so the two apps match optically. */
export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
} as const;

export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
} as const;

/**
 * Named styles. **Prefer these over assembling size + family by hand** — that is
 * how two screens end up with "the same" section header at 17px and 18px.
 */
export const TextStyles = {
  /** Splash / onboarding hero only. */
  /**
   * The largest size in the system, for the one line on a screen that is the
   * whole point of it — the landing hero. Deliberately above the scale's `xxxl`
   * so it cannot be reached by accident from a screen that just wants "big".
   */
  hero: {
    fontFamily: FontFamily.extrabold,
    fontSize: 40,
    lineHeight: Math.round(40 * LineHeight.tight),
    letterSpacing: -0.8,
  },

  display: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxxl,
    lineHeight: Math.round(FontSize.xxxl * LineHeight.tight),
  },
  /** Screen title in a large header. */
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    lineHeight: Math.round(FontSize.xl * LineHeight.tight),
  },
  /** Card title, sheet title, nav bar title. */
  subtitle: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.lg,
    lineHeight: Math.round(FontSize.lg * LineHeight.normal),
  },
  /** "Recommended for you", "Active orders" — the row above a horizontal list. */
  /**
   * The label above a group of cards.
   *
   * <p>Deliberately a different register from the content it introduces, not a
   * larger version of it. At 16px semibold it was a hair bigger than a card's own
   * title at 15px semibold and the same colour — so "New orders" and "Indiranagar"
   * read as two things of equal weight, and the page looked like a flat list with
   * occasional stray words in it.
   *
   * <p>Uppercase and letterspaced at 12px says "this is scaffolding" without
   * competing: a reader's eye skips it on the way to the cards and finds it again
   * when looking for where one group ends.
   */
  sectionTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.xs,
    lineHeight: Math.round(FontSize.xs * LineHeight.normal),
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.base,
    lineHeight: Math.round(FontSize.base * LineHeight.normal),
  },
  /** Body weight-bumped for the one value in a row that matters. */
  bodyEmphasis: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.base,
    lineHeight: Math.round(FontSize.base * LineHeight.normal),
  },
  /** Long-form: dispute descriptions, policy explanations, empty-state copy. */
  bodyRelaxed: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.base,
    lineHeight: Math.round(FontSize.base * LineHeight.relaxed),
  },
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    lineHeight: Math.round(FontSize.sm * LineHeight.normal),
  },
  captionEmphasis: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.sm,
    lineHeight: Math.round(FontSize.sm * LineHeight.normal),
  },
  /** Badges, chips, overline labels. */
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.xs,
    lineHeight: Math.round(FontSize.xs * LineHeight.normal),
    letterSpacing: 0.2,
  },

  // ── Numerics ──────────────────────────────────────────────────────────
  // tabular-nums so figures in a column align on the decimal point.
  /** The headline price on a product card or offer row. */
  price: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    lineHeight: Math.round(FontSize.lg * LineHeight.tight),
    fontVariant: ['tabular-nums' as const],
  },
  /** The order total on a checkout summary. */
  priceLarge: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    lineHeight: Math.round(FontSize.xl * LineHeight.tight),
    fontVariant: ['tabular-nums' as const],
  },
  /** A line-item price inside a cart or comparison row. */
  priceSmall: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.base,
    lineHeight: Math.round(FontSize.base * LineHeight.normal),
    fontVariant: ['tabular-nums' as const],
  },
  /** Quantities, credit balances, percentages, counts. */
  numeric: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.base,
    lineHeight: Math.round(FontSize.base * LineHeight.normal),
    fontVariant: ['tabular-nums' as const],
  },
  /** The supplier response countdown — MM:SS, must not reflow as digits change. */
  countdown: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxl,
    lineHeight: Math.round(FontSize.xxl * LineHeight.tight),
    fontVariant: ['tabular-nums' as const],
  },
  // `satisfies` rather than `as const`: it still infers the literal keys that
  // `TextVariant` is derived from, while checking every entry against RN's
  // TextStyle. `as const` would freeze `fontVariant` into a readonly tuple,
  // which TextStyle rejects.
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof TextStyles;
