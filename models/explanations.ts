import type { ExplanationCode } from '@/models/discovery';

/**
 * Why an offer ranked where it did, in words a restaurant can act on.
 *
 * <p>Doc 05 §8: "Recommended offer must show why it is recommended", and doc 07
 * §5 allows only codes the data actually supports. The mapping lives here rather
 * than in the screen so a new server-side code shows up as an untranslated label
 * in one place instead of silently rendering nothing.
 *
 * <p><b>There is deliberately no commission explanation, and there must never
 * be one.</b> Guardrail 9: commission is not a ranking factor, and a label
 * implying it is would be false as well as damaging.
 */
const LABELS: Record<ExplanationCode, string> = {
  LOWEST_PRICE: 'Lowest price',
  FASTEST_DELIVERY: 'Fastest delivery',
  HIGH_RELIABILITY: 'Reliable supplier',
  HIGH_FILL_RATE: 'Rarely short',
  NEARBY: 'Close by',
  FULL_QUANTITY: 'Has your full quantity',
  HIGHLY_RATED: 'Highly rated',
  PREVIOUSLY_ORDERED: 'You have ordered here',
};

export function explanationLabel(code: ExplanationCode | string): string {
  return LABELS[code as ExplanationCode] ?? humanise(code);
}

/** A code the app has not been taught yet still reads as words, not as SCREAMING_CASE. */
function humanise(code: string): string {
  const spaced = code.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
