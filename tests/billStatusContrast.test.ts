import { BillStatusColors, WalletColors } from '@/theme';

/**
 * WCAG 2.1 contrast of the bill chip and banner tokens, pair by pair as they are drawn: words
 * need 4.5:1 (1.4.3; the chip's 11 sp semibold is not large text), glyphs 3:1 (1.4.11).
 */

type Token = keyof typeof BillStatusColors;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const WHITE = WalletColors.white;

const TEXT: [fg: Token, bg: Token, where: string][] = [
  ['pendingText', 'pendingBg', 'Bill pending chip'],
  ['readingText', 'readingBg', 'Reading bill chip'],
  ['addedText', 'addedBg', 'Bill added chip'],
  ['reviewedText', 'reviewedBg', 'Bill reviewed chip'],
  ['checkText', 'checkBg', 'Check bill chip'],
  ['bannerText', 'bannerBg', 'banner words'],
  ['bannerText', 'bannerPressed', 'banner words while pressed'],
  ['bannerAction', 'bannerBg', 'Show them / Clear'],
  ['bannerAction', 'bannerPressed', 'Show them / Clear while pressed'],
];

/** Glyphs are drawn in the chip's text colour, so they are the same pairs, held to the lower bar. */
const ICONS: [fg: Token, bg: Token, where: string][] = TEXT.slice(0, 5);

describe('bill status colours meet WCAG AA', () => {
  it('the helper agrees with a known pair', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(contrastRatio(WalletColors.ink, WHITE)).toBeCloseTo(21, 0);
  });

  it.each(TEXT)('text %s on %s (%s) is at least 4.5:1', (fg, bg) => {
    expect(contrastRatio(BillStatusColors[fg], BillStatusColors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ICONS)('icon %s on %s (%s) is at least 3:1', (fg, bg) => {
    expect(contrastRatio(BillStatusColors[fg], BillStatusColors[bg])).toBeGreaterThanOrEqual(3);
  });

  // 4.47:1 on the page grey (#F6F6F6), so it is only ever drawn on the white details card.
  it('the quiet "No bill needed" grey reads on the white details card', () => {
    expect(contrastRatio(BillStatusColors.notRequiredText, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});
