/**
 * Mandi colour tokens.
 *
 * The base palette is lifted verbatim from `costonomy-mobile-app/constants/colors.ts`
 * so Mandi reads as part of the Costonomy family. On top of that base this file adds
 * the semantic tokens the procurement domain needs and the Costonomy app does not
 * have — supplier response countdowns, credit exposure, best-value savings, live
 * delivery and stale data.
 *
 * Rules (enforced by `npm run lint`, see .eslintrc):
 *   1. No screen or component may write a literal hex colour. Add a token here.
 *   2. Tokens are named for *meaning*, never for appearance. `Colors.urgent`, not
 *      `Colors.red`. That is what makes a later dark palette a one-file change —
 *      see theme/README.md.
 *
 * The app ships light-only today (`app.json` pins `userInterfaceStyle: light`),
 * matching costonomy-mobile-app. Everything below is the light palette.
 */
export const Colors = {
  // ── Brand ───────────────────────────────────────────────────────────
  primary: '#FF6000',
  primaryLight: '#FFF7ED',
  primaryDark: '#CC4D00',
  /**
   * The brand gradient, dark end first.
   *
   * <p>Two stops of the same hue rather than a second colour: a gradient that
   * changes hue reads as a different brand at each end, and this one sits behind
   * the product's name on the first screen anyone sees.
   */
  gradientStart: '#B8410A',
  gradientEnd: '#FF6000',
  /** Text and hairlines on top of the gradient. */
  onGradient: '#FFFFFF',
  onGradientMuted: 'rgba(255, 255, 255, 0.78)',
  onGradientSurface: 'rgba(255, 255, 255, 0.14)',

  // ── Semantic status ─────────────────────────────────────────────────
  success: '#16A34A',
  successLight: '#F0FDF4',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  info: '#2563EB',
  infoLight: '#EFF6FF',

  // ── Surfaces ────────────────────────────────────────────────────────
  white: '#FFFFFF',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  /** Raised above `surface` — bottom sheets, modals, sticky summary bars. */
  surfaceElevated: '#FFFFFF',
  /** Recessed below `surface` — inset rows, disabled fields, table headers. */
  surfaceSunken: '#F3F4F6',
  scrim: 'rgba(17, 24, 39, 0.45)',
  /**
   * Behind the phone-width frame on web only. Never appears on a device, where
   * the app fills the screen — see `DeviceFrame`.
   */
  backdrop: '#E5E3DF',

  // ── Lines ───────────────────────────────────────────────────────────
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderStrong: '#D1D5DB',
  divider: '#E5E7EB',

  // ── Text ────────────────────────────────────────────────────────────
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',
  textDisabled: '#D1D5DB',

  // ── Marketplace: supplier response SLA (PRD §11, §23A.34) ───────────
  // The 60-second acceptance countdown is a first-class interaction, so it gets
  // its own ramp rather than borrowing danger/warning. Thresholds live in
  // theme/motion.ts (Countdown) so the colour and the timing stay in one story.
  /** Deadline comfortably far away. */
  countdownCalm: '#16A34A',
  countdownCalmBg: '#F0FDF4',
  /** Deadline approaching — supplier should act now. */
  countdownWarn: '#D97706',
  countdownWarnBg: '#FFFBEB',
  /** Deadline imminent, or already expired. */
  countdownCritical: '#DC2626',
  countdownCriticalBg: '#FEF2F2',

  // ── Marketplace: credit (PRD §14, §23A.24) ──────────────────────────
  // Credit is supplier-funded and must never be visually confused with cash
  // payment, so it carries a distinct hue rather than a shade of the brand.
  credit: '#7C3AED',
  creditLight: '#F5F3FF',
  /** Approved limit not yet committed. */
  creditAvailable: '#16A34A',
  /** Held against a placed-but-unaccepted order. */
  creditReserved: '#D97706',
  /** Drawn down against an accepted order. */
  creditUtilized: '#7C3AED',
  /** Past the agreed credit period. */
  creditOverdue: '#DC2626',

  // ── Marketplace: value and ranking (PRD §10, §23A.13) ────────────────
  /** "You save ₹X" — only ever shown against a real calculated figure. */
  savings: '#16A34A',
  savingsLight: '#F0FDF4',
  /** The "Recommended" / "Best value" badge. Never influenced by commission. */
  recommended: '#FF6000',
  recommendedLight: '#FFF7ED',

  // ── Cold chain (API D-134) ──────────────────────────────────────────
  /** Text and icon for chilled goods. 5.9:1 on `coldChainLight`. */
  coldChain: '#0369A1',
  /** The banner behind it. */
  coldChainLight: '#E0F2FE',

  // ── Marketplace: delivery (PRD §15, §23A.21) ────────────────────────
  /** Delivery in progress with a fresh provider location. */
  deliveryLive: '#2563EB',
  deliveryLiveLight: '#EFF6FF',
  /** Route polyline on the tracking map. */
  deliveryRoute: '#2563EB',
  /** The driver marker. */
  deliveryDriver: '#FF6000',
  /** The destination (outlet) marker. */
  deliveryDestination: '#16A34A',

  // ── Marketplace: buyer tracking restyle ─────────────────────────────
  // Orange is Colors.primary (#FF6000); orange text on white is primaryDark.
  /** The live-tracking header bar. White text on it is 5.31:1. */
  trackHeader: '#1E7B3C',
  /** The ETA pill on the header: solid and darker, white text on it is 7.63:1. */
  trackHeaderPill: '#17602F',
  onTrackHeader: '#FFFFFF',
  /** Supplier line on the header only (13/600). */
  onTrackHeaderMuted: 'rgba(255,255,255,0.85)',
  /** The not-yet-driven leg of the route: dashed, 2dp. */
  routePending: '#1F2937',
  geofenceFill: 'rgba(22,163,74,0.15)',
  geofenceStroke: 'rgba(22,163,74,0.45)',
  pickupPin: '#1F2937',
  /** The truck marker: the parcel is the brand orange; stale uses the muted pair. */
  truckParcel: '#FF6000',
  truckParcelLight: '#FFB380',
  truckCab: '#1F2937',
  truckGlass: '#9CC9F5',
  truckMuted: '#9CA3AF',
  truckMutedLight: '#D1D5DB',

  // ── Marketplace: data freshness (PRD §23A.46, guardrail 16/17) ──────
  // Stale is deliberately *grey*, not amber: a stale price or an old GPS fix is
  // not an error, it is unverified. Amber would read as a warning the restaurant
  // must act on, and colour alone must never carry that meaning (§23A.48).
  stale: '#9CA3AF',
  staleBg: '#F3F4F6',
  /** Device is offline — the banner across the top of the screen. */
  offline: '#6B7280',
  offlineBg: '#F3F4F6',

  // ── Availability (PRD §9) ───────────────────────────────────────────
  available: '#16A34A',
  availableLight: '#F0FDF4',
  outOfStock: '#9CA3AF',
  outOfStockLight: '#F3F4F6',

  // ── Marketplace: order tracker (stepper) ────────────────────────────
  // Aliases of existing colours, named for the role so the tracker can be
  // retuned in one place.
  trackerStepDone: '#16A34A',
  trackerStepCurrent: '#FF6000',
  trackerStepTodo: '#E5E7EB',
  trackerRail: '#E5E7EB',
  trackerRailDone: '#16A34A',
  trackerHalo: '#FFF7ED',
  trackerProblem: '#D97706',
  /** The delivery partner's initials avatar. */
  partnerAvatarBg: '#FFF7ED',
  partnerAvatarText: '#CC4D00',

  // ── Marketplace: tracking screen ────────────────────────────────────
  /** The band at the top once an order is delivered; same two-stop idea as the brand gradient. */
  successGradientStart: '#14663A',
  successGradientEnd: '#16A34A',
  /** Text on the light status backgrounds, dark enough to read at small sizes. */
  successText: '#15803D',
  warningText: '#92400E',
  /** The amber banner for a delay or a partner change. */
  warningBanner: '#FBEFD5',
  /** The tracking sheet's grab handle. */
  sheetHandle: '#DCD7D1',
  /** Segments of the progress bar still to come. */
  progressTrack: '#E5E7EB',
  /** The stylised map drawn where there are no tiles (web). */
  mapBackground: '#E8EEE4',
  mapWater: '#CFE0EE',
  mapPark: '#D5E6CF',
  mapRoad: '#FFFFFF',
  /** The "order in progress" bar on the orders list. */
  inProgressBar: '#1F2937',

  // ── Skeletons ───────────────────────────────────────────────────────
  skeletonBase: '#E5E7EB',
  skeletonHighlight: '#F3F4F6',
} as const;

export type ColorToken = keyof typeof Colors;
