/**
 * Tokens for the wallet's "clone" screens: History, the QuickScan camera screen and
 * (next) the transaction detail screen.
 *
 * <p>Every number here was measured from a reference render (see the PR notes) at
 * 1 dp = 620/360 px on a 360 dp phone, so the sizes are the measured Inter sizes scaled
 * by SANS_SCALE and set in the app's Source Sans 3 (FontFamily). Keep the values
 * in this file; a screen that needs one writes `WalletScreen.x`, never a literal.
 */

import { FontFamily } from './typography';

export const WalletFont = {
  regular: FontFamily.regular,
  medium: FontFamily.medium,
  semibold: FontFamily.semibold,
  bold: FontFamily.bold,
} as const;

/**
 * The reference render is set in Inter (cap height 0.73 em); the app's Source Sans 3 has a cap
 * height of about 0.66 em, so every size below is the measured Inter size times this ratio to keep
 * the same visual size. Line heights, tracking-free layout and dp structure are unchanged.
 */
export const SANS_SCALE = 1.1;

export const WalletColors = {
  white: '#FFFFFF',
  ink: '#000000',
  background: '#FFFFFF',
  bandBackground: '#FAFAFA',
  bandHairline: '#ECECEC',
  divider: '#EBEBEB',
  pillBorder: '#E9E9E9',
  avatarCircle: '#F6F6F6',
  rowPressed: '#F6F6F6',
  label: '#333333',
  bandLabel: '#474747',
  meta: '#8F8F8F',
  account: '#8A8A8A',
  placeholder: '#919191',
  chevron: '#9B9B9B',
  credit: '#0A782C',
  /** Brand orange (same value as `Colors.primary`) and its tint. */
  orange: '#FF6000',
  orangeDark: '#CC4D00',
  orangeTint: '#FFF1E6',
  orangePale: '#FFE8D6',
  searchSeparator: '#F0D9C6',
  /** Scan screen */
  scanDim: 'rgba(0, 0, 0, 0.41)',
  scanChip: 'rgba(255, 255, 255, 0.15)',
  scanChipPressed: 'rgba(255, 255, 255, 0.28)',
  scanChipTorchOn: 'rgba(255, 96, 0, 0.9)',
  scanSubtitle: 'rgba(255, 255, 255, 0.96)',
  scanBackdrop: '#1F2937',
  scanInk: '#1F2937',
  scanStatusInk: '#141210',
} as const;

/** Font size, tracking and line height in dp/sp, per text role. */
export const WalletType = {
  // History
  title: { fontFamily: WalletFont.bold, fontSize: 17.5, letterSpacing: 0, lineHeight: 20 },
  pill: { fontFamily: WalletFont.semibold, fontSize: 11.5, letterSpacing: 0, lineHeight: 14 },
  search: { fontFamily: WalletFont.regular, fontSize: 13, letterSpacing: 0, lineHeight: 16 },
  bandLabel: { fontFamily: WalletFont.regular, fontSize: 12, letterSpacing: 0, lineHeight: 14 },
  bandAmount: { fontFamily: WalletFont.medium, fontSize: 14, letterSpacing: 0, lineHeight: 16 },
  rowLabel: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 12 },
  rowName: { fontFamily: WalletFont.regular, fontSize: 14.5, letterSpacing: 0, lineHeight: 16 },
  rowAmount: { fontFamily: WalletFont.semibold, fontSize: 14.5, letterSpacing: 0, lineHeight: 16 },
  rowMeta: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 12 },
  rowAccount: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 12 },
  // Scan screen
  scanTitle: { fontFamily: WalletFont.semibold, fontSize: 13, letterSpacing: 0.1, lineHeight: 12 },
  scanSubtitle: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 9.5 },
  scanChipLabel: { fontFamily: WalletFont.medium, fontSize: 10, letterSpacing: 0, lineHeight: 9 },
  scanLink: { fontFamily: WalletFont.semibold, fontSize: 10, letterSpacing: 0, lineHeight: 9 },
} as const;

/** Layout measures, dp. */
export const WalletLayout = {
  // History
  /** Under the status bar, down to the top of the title row (pill top at 99.5 dp, status bar 24). */
  historyTopBar: 75.5,
  /** Top of the 44 dp help/back targets under the status bar: centred on the glyph at y 64.5. */
  historyIconTop: 18.5,
  historyHelpRight: 2.5,
  /** Pill bottom (134.5) to search top (151.5). */
  historySearchGap: 17,
  titleLeft: 21.5,
  pillHeight: 35,
  pillRadius: 17.5,
  pillBorder: 1,
  pillPadLeft: 13.8,
  pillPadRight: 13.9,
  pillIcon: 14,
  pillIconGap: 6.8,
  pillRight: 20.5,
  helpIcon: 22,
  searchHeight: 48,
  searchRadius: 24,
  searchMargin: 14,
  searchTop: 14,
  searchPadLeft: 13.3,
  searchPadRight: 13.3,
  searchIcon: 21,
  searchIconGap: 14.7,
  searchSeparatorHeight: 21.5,
  searchSeparatorGap: 13.3,
  listTop: 28,
  bandHeight: 44,
  bandLeft: 21,
  bandRight: 20.5,
  bandAmountGap: 5.9,
  chevron: 11,
  rowHeight: 90,
  rowLeft: 20,
  rowRight: 21,
  rowTop: 20.5,
  avatar: 35,
  avatarMoneyInRadius: 9,
  avatarArrow: 25,
  textColumn: 70,
  textGap: 15,
  /**
   * Row text is placed by cap height, not line box: label cap 22, name and amount cap 36.5,
   * meta/account cap 59 dp from the row top. For a font with cap ratio ~0.7, cap top sits at lineHeight/2 - 0.363 x size
   * under the top of the line box, which gives these line-box tops.
   */
  labelTop: 19.5,
  nameTop: 1.7,
  nameAmountGap: 18,
  amountTop: 33.2,
  metaTop: 7.3,
  accountGap: 6.5,
  accountIcon: 12,
  dividerInset: 70,
  // Scan screen
  scanWindow: 251,
  scanWindowRadius: 12,
  scanWindowTop: 146,
  scanBracketInset: 15.5,
  scanBracketInsetTop: 15,
  scanBracketInsetBottom: 17,
  scanBracketStroke: 3.5,
  scanBracketArm: 31.5,
  scanBracketRadius: 8,
  scanHeaderTop: 12,
  scanHeaderHeight: 35,
  scanBackLeft: 6.7,
  scanTitleLeft: 3.5,
  scanSubtitleGap: 1.9,
  scanHelpRight: 6,
  scanHelpRing: 17.5,
  scanChip: 40.5,
  /** Chip columns are 60.5 wide with 29 between, so the discs' centres are 89.5 apart. */
  scanChipColumn: 60.5,
  scanChipColumnGap: 29,
  scanChipTop: 31.5,
  scanChipLabelGap: 8.6,
  scanLinkUnderline: 1.2,
  scanLinkUnderlineGap: 0.3,
  tap: 44,
} as const;

// ── Transaction details and the shared receipt ────────────────────────
// Measured from the detail reference (plan2/detail/spec.md), 1 dp = 620/360 px (sizes scaled for Source Sans 3).

/** Header colour and wording per entry status; the system status bar is painted the same colour. */
export const DetailStatusColors = {
  success: '#0B7A2D',
  inProgress: '#B45309',
  failed: '#B91C1C',
  returned: '#9A3412',
} as const;

export const DetailColors = {
  page: '#F6F6F6',
  card: '#FFFFFF',
  divider: '#E9E9E9',
  title: '#000000',
  name: '#1A1A1A',
  text: '#141414',
  value: '#171717',
  wallet: '#131313',
  secondary: '#666666',
  section: '#1B1B1B',
  support: '#1D1D1D',
  icon: '#111111',
  bandTitle: '#1D1D1D',
  bandTime: '#444444',
  actionRipple: '#FFE2CC',
  snackbar: '#323232',
  skeleton: '#EAEAEA',
  shadow: '#000000',
  headerRipple: 'rgba(255, 255, 255, 0.2)',
} as const;

export const DetailType = {
  headerTitle: { fontFamily: WalletFont.semibold, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  headerTime: { fontFamily: WalletFont.regular, fontSize: 10.5, lineHeight: 11.5, letterSpacing: 0 },
  cardTitle: { fontFamily: WalletFont.semibold, fontSize: 13, lineHeight: 14.5, letterSpacing: 0 },
  name: { fontFamily: WalletFont.regular, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  amountBold: { fontFamily: WalletFont.semibold, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  sub: { fontFamily: WalletFont.regular, fontSize: 12.5, lineHeight: 14, letterSpacing: 0 },
  section: { fontFamily: WalletFont.medium, fontSize: 12.5, lineHeight: 14, letterSpacing: 0 },
  label: { fontFamily: WalletFont.regular, fontSize: 11, lineHeight: 12, letterSpacing: 0 },
  value: { fontFamily: WalletFont.regular, fontSize: 12.5, lineHeight: 14, letterSpacing: 0 },
  action: { fontFamily: WalletFont.regular, fontSize: 10.5, lineHeight: 11.5, letterSpacing: 0 },
  bandTitle: { fontFamily: WalletFont.regular, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  bandTime: { fontFamily: WalletFont.regular, fontSize: 10.5, lineHeight: 11.5, letterSpacing: 0 },
} as const;

export const DetailLayout = {
  headerBar: 56,
  back: 48,
  backLeft: 0,
  titleLeft: 62,
  headerTimeGap: 0.1,
  /** Back arrow and titles sit 4 dp under the bar's centre, as measured. */
  headerShift: 8,
  backGlyph: 17,
  cardMargin: 7,
  cardTop: 8,
  cardRadius: 8,
  cardPadTop: 11.5,
  cardPadBottom: 15.5,
  cardInset: 14,
  titleToAvatar: 12,
  avatar: 35,
  avatarRadius: 13,
  avatarArrow: 17.5,
  avatarLeft: 13.5,
  textGap: 14.5,
  nameTop: 4,
  subTop: 2,
  dividerInset: 21,
  dividerTop: 14.5,
  divider: 0.6,
  sectionHeight: 48,
  sectionLeft: 15.5,
  sectionRight: 16,
  sectionTop: -0.6,
  sectionBottom: -7.5,
  sectionIcon: 16.5,
  sectionTextGap: 15.8,
  chevron: 16,
  labelTop: 8,
  labelNext: 13.2,
  valueTop: 4.5,
  walletTop: 10.6,
  walletRow: 17.5,
  walletIcon: 20,
  walletLeft: 17,
  walletNameGap: 26,
  /** The copy button is 48 wide; its 12 dp glyph then ends 21 dp from the card edge. */
  copyRowRight: 3,
  refTop: 11,
  refLeft: 62,
  copyTap: 48,
  copyIcon: 17,
  copyWidth: 11.5,
  copyHeight: 15,
  actionsTop: 16.9,
  actionsDividerTop: 14.3,
  circle: 40.5,
  actionLabelTop: 8.3,
  actionColumnWidth: 80,
  supportTop: 7.5,
  supportHeight: 48,
  supportLeft: 19,
  supportRight: 16.3,
  supportTextGap: 25.3,
  supportIcon: 17,
  pageBottom: 16,
  // Receipt picture
  receiptWidth: 360,
  receiptBand: 48,
  receiptLogoLeft: 21,
  receiptLogoHeight: 17.5,
  receiptLogoWidth: 77.5,
  receiptTitleLeft: 111,
  receiptCardTop: 6,
  receiptBottom: 14,
  receiptScale: 3,
  receiptPixelWidth: 1080,
  snackbarHeight: 40,
} as const;

// ── Bill capture and the invoice viewer ───────────────────────────────

export const BillColors = {
  matchBg: '#E8F5EC',
  matchText: '#0B7A2D',
  differBg: '#FFF4DB',
  differText: '#8A5A00',
  noneBg: '#EFEFEF',
  noneText: '#555555',
  viewerBg: '#111111',
  viewerChrome: '#FFFFFF',
  viewerDot: '#6B6B6B',
  thumbBg: '#F0F0F0',
  thumbBorder: '#E2E2E2',
  progressTrack: '#E9E9E9',
  danger: '#B91C1C',
  scrim: 'rgba(0, 0, 0, 0.55)',
} as const;

export const BillType = {
  title: { fontFamily: WalletFont.semibold, fontSize: 16, lineHeight: 20, letterSpacing: 0 },
  body: { fontFamily: WalletFont.regular, fontSize: 14, lineHeight: 19, letterSpacing: 0 },
  bodyStrong: { fontFamily: WalletFont.semibold, fontSize: 14, lineHeight: 19, letterSpacing: 0 },
  small: { fontFamily: WalletFont.regular, fontSize: 12.5, lineHeight: 16, letterSpacing: 0 },
  tableHead: { fontFamily: WalletFont.medium, fontSize: 11.5, lineHeight: 14, letterSpacing: 0 },
} as const;

export const BillLayout = {
  thumbWidth: 44,
  thumbHeight: 56,
  thumbRadius: 6,
  rowLeft: 15.5,
  rowRight: 16,
  rowGap: 15,
  rowVertical: 10,
  pageThumb: 88,
  viewerImageHeight: 380,
  bannerRadius: 8,
  progressHeight: 6,
  dot: 6,
} as const;

// ── Reviewing a bill ──────────────────────────────────────────────────
// The cost app's Upload Invoice review, on the app's light palette. Line-card tints follow the
// web screen: mint for a resolved line, amber for one that needs attention, blue for a new SKU.
// Contrast (WCAG 2.1 AA, checked by tests/reviewContrast.test.ts): text tokens reach 4.5:1 on every
// surface they are drawn on; field borders reach 3:1 (non-text contrast). The brand orange #FF6000
// is 3.0:1 on white, so it is used for fills, rings and icons only; orange words use `orangeText`.

export const ReviewColors = {
  page: '#F9FAFB',
  card: '#FFFFFF',
  cardBorder: '#E5E7EB',
  field: '#FFFFFF',
  /** 3.5:1 on white, 3.2:1 on the band: an input's edge must be seen (WCAG 1.4.11). */
  fieldBorder: '#828A96',
  fieldFocus: '#FF6000',
  fieldDisabled: '#F3F4F6',
  text: '#1F2937',
  secondary: '#6B7280',
  /** Helper text, notes and placeholders (4.8:1 on white). */
  tertiary: '#6B7280',
  /** Text drawn on the grey band (TOTAL, ITEM PRICE, the unselected segment, neutral chips): 6.9:1 there. */
  secondaryOnBand: '#4B5563',
  divider: '#E5E7EB',
  band: '#F3F4F6',
  badgeBg: '#E5E7EB',
  badgeText: '#374151',
  /** Fills, focus rings and icons. Never words: see `orangeText`. */
  orange: '#FF6000',
  /** Orange words (Create SKU, Reset, Open, Try again): 5.2:1 on white. */
  orangeText: '#C2410C',
  orangeTint: '#FFF7ED',
  onOrange: '#FFFFFF',
  required: '#DC2626',
  error: '#B91C1C',
  errorBorder: '#DC2626',
  resolvedCard: '#F0FDF7',
  resolvedBorder: '#86EFAC',
  resolvedChip: '#DCFCE7',
  resolvedText: '#15803D',
  attentionCard: '#FFFBEB',
  attentionBorder: '#FCD34D',
  attentionChip: '#FEF3C7',
  attentionText: '#B45309',
  newCard: '#F5F9FF',
  newBorder: '#BFDBFE',
  newChip: '#DBEAFE',
  newText: '#1D4ED8',
  deviationBg: '#FEF2F2',
  deviationBorder: '#FECACA',
  deviationValue: '#B91C1C',
  deviationNote: '#B45309',
  ignoreBg: '#FFFBEB',
  ignoreBorder: '#D97706',
  ignoreText: '#B45309',
  ignoredBg: '#F0FDF4',
  ignoredBorder: '#16A34A',
  ignoredText: '#15803D',
  ready: '#15803D',
  panelImage: '#F3F4F6',
  panelDot: '#D1D5DB',
  panelDotOn: '#4B5563',
  selected: '#FFF7ED',
  dayToday: '#FF6000',
  /** The picked day's fill: white digits on it reach 5.2:1 (brand orange would be 3.0:1). */
  daySelected: '#C2410C',
  /** A day that cannot be picked: visibly greyed (inactive controls are outside WCAG's contrast rule). */
  dayDisabled: '#A7AEB8',
  skeleton: '#E5E7EB',
  scrim: 'rgba(17, 24, 39, 0.45)',
} as const;

export const ReviewLayout = {
  gutter: 16,
  cardRadius: 12,
  cardPad: 16,
  sectionGap: 16,
  fieldHeight: 44,
  fieldRadius: 8,
  /** Reserved under every input, so an error appearing never moves the form. */
  helperHeight: 18,
  badge: 24,
  panelImageHeight: 260,
  panelControl: 44,
  tap: 44,
  sheetMaxHeight: 560,
  daySize: 44,
} as const;

// ── Bill status chips and the History banner ──────────────────────────
// Contrast (checked by tests/billStatusContrast.test.ts): every word reaches 4.5:1 on the fill it
// is drawn on and every icon 3:1. Status is never colour alone: each chip also carries words and a glyph.

export const BillStatusColors = {
  pendingBg: '#FEF3C7',
  pendingText: '#92400E',
  pendingBorder: '#F3D9A4',
  readingBg: '#F3F4F6',
  readingText: '#4B5563',
  addedBg: '#E6F4EA',
  addedText: '#0B7A2D',
  reviewedBg: '#0B7A2D',
  reviewedText: '#FFFFFF',
  checkBg: '#FEE2E2',
  checkText: '#B91C1C',
  notRequiredText: '#6B7280',
  bannerBg: '#FFF8E6',
  bannerBorder: '#F3D9A4',
  bannerText: '#92400E',
  bannerAction: '#C2410C',
  bannerPressed: '#FEF3C7',
} as const;

/** Chip measures, dp. The chip is a fixed 22 dp high at any font scale (its label stops growing at 1.3x). */
export const BillChipLayout = {
  height: 22,
  radius: 11,
  padX: 9,
  icon: 12,
  gap: 4,
  dot: 6,
  readingDot: 3,
  /** Between the time and the chip on a History row. */
  timeGap: 6,
  bannerRadius: 12,
  bannerMinHeight: 44,
  bannerPadX: 12,
  bannerPadY: 10,
} as const;

export const BillChipType = {
  label: { fontFamily: WalletFont.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  banner: { fontFamily: WalletFont.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  bannerStrong: { fontFamily: WalletFont.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
} as const;
