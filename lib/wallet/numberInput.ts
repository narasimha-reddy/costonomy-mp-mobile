/**
 * What a number field on the bill review keeps of what was typed or pasted.
 *
 * <p>The rule is never to guess. A comma can be a decimal point ("1,5" on a European keyboard) or a
 * thousands separator ("1,500" as Indians write it), and reading it the wrong way changes a figure a
 * hundred or a thousand times. So:
 * <ul>
 *   <li>Only the phone's own decimal separator is a decimal point. The value is kept with a "." whatever
 *       the phone uses, and shown with the phone's separator.</li>
 *   <li>Typing the other separator does nothing to the value, and says "Use a dot for decimals".</li>
 *   <li>Pasted text with grouping is read only when the grouping cannot mean anything else: Western
 *       groups of three ("12,000", "1,234,567") or the Indian 2-2-3 pattern ("1,20,000"), with no group
 *       starting the number with 0. The field then says how it was read ("Read as 1,500"). Anything else
 *       with that character ("1,5", "1,23", "0,125") is refused with the same message.</li>
 *   <li>Too many digits or decimals is refused, never cut: cutting "12345678901" to ten digits, or "0.125"
 *       to "0.12", would quietly change the number.</li>
 * </ul>
 */

export type DecimalSeparator = '.' | ',';

export interface NumberRules {
  /** Places after the point: 2 for money, 3 for a quantity. */
  decimals: number;
  /** Digits before the point. */
  maxInt: number;
  /** The phone's decimal separator. */
  separator: DecimalSeparator;
}

export type NumberRead =
  /** Keep this value (always with "."); `note` says how pasted grouping was read. */
  | { ok: true; value: string; note: string | null }
  /** Keep the previous value and show `message`. */
  | { ok: false; message: string };

/** The phone's decimal separator, from its number format; "." when it cannot be told. */
export function deviceDecimalSeparator(): DecimalSeparator {
  try {
    const parts = new Intl.NumberFormat().formatToParts(1.5);
    return parts.find((p) => p.type === 'decimal')?.value === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

const otherOf = (sep: DecimalSeparator): DecimalSeparator => (sep === '.' ? ',' : '.');
const separatorName = (sep: DecimalSeparator) => (sep === '.' ? 'a dot' : 'a comma');

/** "Use a dot for decimals" (or a comma, on a phone that writes decimals with one). */
export function separatorMessage(sep: DecimalSeparator): string {
  return `Use ${separatorName(sep)} for decimals`;
}

/** What changed between two texts: one run inserted (or replaced) at one place. */
function insertedText(prev: string, next: string): string {
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  return next.slice(start, endNext);
}

/** Words that scale a figure (1.5k, 2L, 5 cr): reading them as plain digits would be off by 1000x or more. */
const MAGNITUDE = /^(?:k|l|lacs?|lakhs?|cr|crores?|thousand|m|mn|million|b|bn)$/i;

/**
 * "₹ 1,500", "Rs. 1,500", "INR 1500", "1500 INR" and "1500/-" lose their currency marker. Any other letters
 * are refused, never dropped: "1.5k" is not 1.5. The result is the figure, or the message to show.
 */
function stripWords(text: string): { text: string } | { message: string } {
  const t = text.trim()
    .replace(/^(?:₹|rs\.?|inr)(?![a-z])\s*/i, '')
    .replace(/([^a-z])\s*(?:₹|rs\.?|inr)$/i, '$1')
    .replace(/\s*\/-$/, '')
    .trim();
  if (/^[0-9.,]*$/.test(t)) return { text: t };
  const letters = t.replace(/[^a-z]+/gi, ' ').trim();
  if (/[a-z]/i.test(t) && MAGNITUDE.test(letters)) return { message: 'Type the full amount' };
  return { message: 'Use digits only' };
}

/** Indian (1,20,000) or Western (1,200,000) grouping of a whole number, by `g`. */
function groupedWhole(int: string, g: string): boolean {
  const e = g === '.' ? '\\.' : g;
  const western = new RegExp(`^[1-9]\\d{0,2}(?:${e}\\d{3})+$`);
  const indian = new RegExp(`^[1-9]\\d?(?:${e}\\d{2})+${e}\\d{3}$`);
  return western.test(int) || indian.test(int);
}

/** A plain "123.45" (or "", "12.") against the size rules: the value, or why not. */
function checkSize(plain: string, rules: NumberRules): NumberRead {
  const [rawInt = '', frac] = plain.split('.');
  const int = rawInt.replace(/^0+(?=\d)/, '');
  if (int.length > rules.maxInt) return { ok: false, message: `Use at most ${rules.maxInt} digits before the point` };
  if (frac != null && rules.decimals === 0) return { ok: false, message: 'Use a whole number' };
  if (frac != null && frac.length > rules.decimals) {
    return { ok: false, message: `Use at most ${rules.decimals} decimal${rules.decimals === 1 ? '' : 's'}` };
  }
  return { ok: true, value: frac == null ? int : `${int === '' ? '0' : int}.${frac}`, note: null };
}

/** The figure with Indian grouping, as a note says how it was read: "1,20,000.50". */
export function groupForDisplay(value: string, sep: DecimalSeparator = '.'): string {
  if (!/^\d+(\.\d*)?$/.test(value)) return value.replace('.', sep);
  const [int = '', frac] = value.split('.');
  const g = otherOf(sep);
  let grouped = int;
  if (int.length > 3) {
    const head = int.slice(0, -3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, g)}${g}${int.slice(-3)}`;
  }
  return frac == null ? grouped : `${grouped}${sep}${frac}`;
}

/**
 * Read a number field's new text against its previous value (both as the field shows them, with the
 * phone's separator). A change of one character is typing; anything bigger is a paste.
 */
export function readNumberInput(next: string, prev: string, rules: NumberRules): NumberRead {
  const sep = rules.separator;
  const group = otherOf(sep);
  const added = insertedText(prev, next);
  const typed = added.length <= 1 && next.length >= prev.length - 1 && Math.abs(next.length - prev.length) <= 1;

  if (typed) {
    if (added === group) return { ok: false, message: separatorMessage(sep) };
    if (added !== '' && !/[0-9]/.test(added) && added !== sep) return { ok: false, message: 'Use digits only' };
    if (next.split(sep).length > 2) return { ok: false, message: 'There is already a decimal point' };
    if (next.includes(group)) return { ok: false, message: separatorMessage(sep) };
    // Deleting from a pre-filled negative ("-50", from the bill's own discount line) drops the sign.
    const kept = added === '' && next.startsWith('-') ? next.slice(1) : next;
    return checkSize(sep === ',' ? kept.replace(',', '.') : kept, rules);
  }

  // Pasted (or replaced in one go).
  const stripped = stripWords(next);
  if ('message' in stripped) return { ok: false, message: stripped.message };
  const text = stripped.text;
  if (!text.includes(group)) {
    if (text.split(sep).length > 2) return { ok: false, message: 'Check the number: it has two decimal points' };
    return checkSize(sep === ',' ? text.replace(',', '.') : text, rules);
  }
  const [int = '', frac, extra] = text.split(sep);
  if (extra != null || (frac != null && frac.includes(group)) || !groupedWhole(int, group)) {
    return { ok: false, message: separatorMessage(sep) };
  }
  const plain = `${int.split(group).join('')}${frac != null ? `.${frac}` : ''}`;
  const sized = checkSize(plain, rules);
  if (!sized.ok) return sized;
  return { ...sized, note: `Read as ${text}` };
}

/** The stored value ("1500.5") as the field shows it while being edited: the phone's separator, no grouping. */
export function toFieldText(value: string, sep: DecimalSeparator): string {
  return sep === ',' ? value.replace('.', ',') : value;
}
