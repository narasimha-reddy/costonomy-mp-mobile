import type { WalletLimits } from '@/models/wallet';
import { formatMoney, type Money } from '@/utils/money';

/**
 * What someone types into the add-money field, checked against the server's limits.
 *
 * <p><b>A hint before a tap, never the verdict.</b> The server checks every top-up
 * against its own limits at the moment it is made, and its message is what is
 * shown when it refuses. This exists so the obvious mistakes (₹0, three decimals,
 * more than the month has left) are named while the person is still typing rather
 * than after a round trip.
 *
 * <p>Compared as integers, never as floats: amounts are held as ten-thousandths of
 * a rupee (the server's four decimals), so ₹10.10 and ₹99999.99 compare exactly.
 * Nothing is added up to produce a figure that is shown as money or sent — the
 * amount sent is the text typed, normalised to two decimals.
 */
const SCALE = 10_000;
/** Nine whole-rupee digits is ₹99,99,99,999 — far past any wallet, and well inside safe integers. */
const MAX_WHOLE_DIGITS = 9;

/** The quick-add chips, in rupees. Each adds to what is already typed. */
export const TOP_UP_CHIPS = [500, 1000, 5000] as const;

/**
 * A decimal string as ten-thousandths of a rupee, or null if it is not a plain
 * non-negative decimal with at most `maxDecimals` places.
 */
export function toScaled(text: string | number, maxDecimals: number): number | null {
  // The API's decimals are meant to be strings but arrive as JSON numbers on some
  // responses, as `formatMoney` also allows for.
  const match = /^(\d{0,9})(?:\.(\d*))?$/.exec(String(text).trim());
  if (match == null) return null;
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  if (whole === '' && fraction === '') return null;
  if (fraction.length > maxDecimals) return null;
  return Number(whole || '0') * SCALE + Number(fraction.padEnd(4, '0').slice(0, 4));
}

/** Whether the text has more than two decimals or too many digits, for the right message. */
function whyUnreadable(text: string): string {
  const trimmed = text.trim();
  if (/^\d*\.\d{3,}$/.test(trimmed)) return 'Use at most 2 decimal places.';
  if (/^\d{10,}(\.\d*)?$/.test(trimmed)) return 'That amount is too large.';
  return 'Enter an amount like 500 or 500.50.';
}

/**
 * Scaled units back to the two-decimal string the API takes: "500.00".
 *
 * <p><b>Floors, never rounds.</b> Rounding paise up could carry past 99 (giving
 * "100.100") or send more than the person typed or the server owes; truncating
 * to whole paise can only ever send less. The fields refuse a third decimal, so
 * for typed amounts this is exact; the floor makes the helper safe for any other
 * input too.
 */
export function scaledToAmount(scaled: number): string {
  const whole = Math.max(0, Math.floor(scaled));
  const rupees = Math.floor(whole / SCALE);
  const paise = Math.floor((whole % SCALE) / 100);
  return `${rupees}.${String(paise).padStart(2, '0')}`;
}

export interface TopUpCheck {
  /** Whether the Pay button may be enabled. */
  ok: boolean;
  /** The amount to send, "500.00". Present only when `ok`. */
  amount: string | null;
  /** Why not, when there is something to say. Null for an empty field. */
  message: string | null;
}

/**
 * @param balance the wallet's current balance, for the "would exceed the maximum"
 *   hint. Skipped when unknown.
 * @param limits the server's limits, or absent (older API), in which case only
 *   the format and a positive amount are checked.
 */
export function checkTopUp(
  text: string,
  limits: WalletLimits | null | undefined,
  balance?: Money | number | null,
): TopUpCheck {
  if (text.trim() === '') return { ok: false, amount: null, message: null };

  const scaled = toScaled(text, 2);
  if (scaled == null) return { ok: false, amount: null, message: whyUnreadable(text) };
  if (scaled === 0) return { ok: false, amount: null, message: 'Enter an amount above ₹0.' };

  if (limits != null) {
    const min = toScaled(limits.minTopUp, 4);
    const max = toScaled(limits.maxTopUp, 4);
    const remaining = toScaled(limits.remainingThisMonth, 4);
    const maxBalance = toScaled(limits.maxBalance, 4);
    const held = balance == null ? null : toScaled(balance, 4);

    if (min != null && scaled < min) {
      return blocked(`The smallest amount you can add is ${formatMoney(limits.minTopUp, true)}.`);
    }
    if (max != null && scaled > max) {
      return blocked(`The most you can add at a time is ${formatMoney(limits.maxTopUp, true)}.`);
    }
    if (remaining != null && scaled > remaining) {
      return blocked(remaining === 0
        ? 'You have reached this month’s limit for adding money.'
        : `You can add ${formatMoney(limits.remainingThisMonth, true)} more this month.`);
    }
    if (maxBalance != null && held != null && held + scaled > maxBalance) {
      return blocked(`Your wallet can hold up to ${formatMoney(limits.maxBalance, true)} in total.`);
    }
  }

  return { ok: true, amount: scaledToAmount(scaled), message: null };
}

function blocked(message: string): TopUpCheck {
  return { ok: false, amount: null, message };
}

/**
 * The field's text after tapping a "+₹500" chip: what is typed plus the chip.
 *
 * <p>Unreadable or empty text counts as nothing typed. A total that would run past
 * the digits the field accepts leaves the text as it was.
 */
export function addChip(text: string, chipRupees: number): string {
  const current = toScaled(text, 2) ?? 0;
  const next = current + chipRupees * SCALE;
  if (next >= 10 ** MAX_WHOLE_DIGITS * SCALE) return text;
  const whole = Math.floor(next / SCALE);
  const paise = Math.floor((next % SCALE) / 100);
  return paise === 0 ? String(whole) : `${whole}.${String(paise).padStart(2, '0')}`;
}
