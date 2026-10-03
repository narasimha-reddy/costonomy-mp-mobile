import { ReviewColors } from '@/theme';

/**
 * WCAG 2.1 contrast of the review screen's tokens, pair by pair as the screen draws them: text needs
 * 4.5:1 (1.4.3; none of this text is large), an input's edge and icons that carry meaning 3:1 (1.4.11).
 */

type Token = keyof typeof ReviewColors;

/** Relative luminance of an #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT: [fg: Token, bg: Token, where: string][] = [
  ['text', 'card', 'values and names'],
  ['text', 'band', 'line total on the band'],
  ['secondary', 'card', 'labels, helper text'],
  ['secondary', 'page', 'notes on the page'],
  ['secondary', 'attentionCard', 'FROM INVOICE on a card that needs attention'],
  ['secondary', 'resolvedCard', 'FROM INVOICE on a resolved card'],
  ['secondary', 'newCard', 'FROM INVOICE on a new card'],
  ['secondary', 'selected', 'option subtitle on the selected row'],
  ['secondaryOnBand', 'band', 'TOTAL / ITEM PRICE, unselected segment, neutral chip, lookup note'],
  ['secondaryOnBand', 'panelImage', 'could not load the bill photo'],
  ['tertiary', 'field', 'placeholders'],
  ['tertiary', 'card', 'summary note'],
  ['orangeText', 'card', 'Create SKU, Reset, Open, Try again, Create supplier'],
  ['orangeText', 'attentionCard', 'Create SKU on a card that needs attention'],
  ['orangeText', 'newCard', 'Create SKU on a new card'],
  ['orangeText', 'resolvedCard', 'Create SKU on a resolved card'],
  ['error', 'card', 'field errors'],
  ['error', 'deviationBg', 'messages at the top'],
  ['error', 'attentionCard', 'a field error on a card that needs attention'],
  ['attentionText', 'card', 'footer status'],
  ['attentionText', 'attentionCard', 'line hint, confirm-date bar'],
  ['attentionText', 'attentionChip', 'Needs attention chip'],
  ['resolvedText', 'resolvedChip', 'Resolved chip'],
  ['newText', 'newChip', 'New chip'],
  ['ready', 'card', 'All items ready'],
  ['deviationValue', 'deviationBg', 'the deviating price'],
  ['deviationNote', 'deviationBg', '· deviates from'],
  ['deviationNote', 'band', '· deviates from, once ignored'],
  ['ignoreText', 'ignoreBg', 'Ignore'],
  ['ignoredText', 'ignoredBg', 'Ignored'],
  ['onOrange', 'daySelected', 'the picked day'],
  ['badgeText', 'badgeBg', 'the line number'],
];

const NON_TEXT: [fg: Token, bg: Token, where: string][] = [
  ['fieldBorder', 'field', 'an input’s edge'],
  ['fieldBorder', 'card', 'buttons drawn as outlines'],
  ['fieldBorder', 'page', 'the search box on the page'],
  ['fieldBorder', 'band', 'the segmented control'],
  ['fieldFocus', 'field', 'the focus ring'],
  ['errorBorder', 'field', 'an invalid input'],
  ['orange', 'card', 'orange icons'],
  ['dayToday', 'card', 'today’s ring'],
];

describe('review colours meet WCAG AA', () => {
  it('the helper agrees with the review’s measurements', () => {
    expect(contrastRatio(ReviewColors.card, ReviewColors.card)).toBeCloseTo(1, 5);
    expect(contrastRatio(ReviewColors.orange, ReviewColors.card)).toBeCloseTo(3.03, 2); // why orange is never words
    expect(contrastRatio(ReviewColors.cardBorder, ReviewColors.card)).toBeLessThan(3); // decoration only, never an input edge
  });

  it.each(TEXT)('text %s on %s (%s) is at least 4.5:1', (fg, bg) => {
    expect(contrastRatio(ReviewColors[fg], ReviewColors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT)('%s on %s (%s) is at least 3:1', (fg, bg) => {
    expect(contrastRatio(ReviewColors[fg], ReviewColors[bg])).toBeGreaterThanOrEqual(3);
  });

  it('the values the review asked for: orange words 5.18:1, grey helper text 4.83:1', () => {
    expect(contrastRatio(ReviewColors.orangeText, ReviewColors.card)).toBeCloseTo(5.18, 2);
    expect(contrastRatio(ReviewColors.tertiary, ReviewColors.card)).toBeCloseTo(4.83, 2);
  });
});
