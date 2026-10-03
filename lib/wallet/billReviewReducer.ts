import type { ReviewPaymentStatus, ReviewSku } from '@/models/wallet';
import {
  blankLine, isPlainDecimal, lineField,
  type FieldKey, type FormLine, type ReviewForm,
} from './billReview';

/**
 * The review form's state: the form itself, and the server's (or the Save checks') messages per input.
 *
 * <p>Lines are addressed by their client `key`, never by `lineNo` (which added lines do not have).
 * Every change replaces only what it touches: one line's edit produces a new object for that line and
 * keeps every other line's identity, so the memoised line cards that did not change do not render.
 *
 * <p>Number fields arrive already read by the field (`numberInput.ts`: digits and one "."); anything
 * else is ignored here, so nothing reaches the form that could change a figure by a guess.
 */
export interface ReviewState {
  form: ReviewForm;
  errors: Partial<Record<FieldKey, string>>;
  /** Messages that matched no input (shown at the top). */
  otherErrors: string[];
}

export type NumberField = 'quantity' | 'amount' | 'tax';

export type ReviewAction =
  | { type: 'reset'; form: ReviewForm }
  | { type: 'setSupplier'; supplier: { id: number | null; name: string } }
  | { type: 'setInvoiceNumber'; value: string }
  | { type: 'setPaymentStatus'; value: ReviewPaymentStatus }
  | { type: 'setInvoiceDate'; value: string }
  | { type: 'setStockInDate'; value: string }
  | { type: 'confirmDate' }
  | { type: 'setLineNumber'; key: string; field: NumberField; value: string }
  | { type: 'setLineSku'; key: string; sku: ReviewSku }
  | { type: 'toggleIgnore'; key: string }
  /** Appends a blank line with this key (made by the caller, so the reducer stays pure). */
  | { type: 'addLine'; key: string }
  | { type: 'removeLine'; key: string }
  | { type: 'setDelivery'; value: string }
  | { type: 'resetDelivery' }
  | { type: 'setTaxOverride'; value: string }
  | { type: 'resetTaxOverride' }
  | { type: 'setErrors'; errors: Partial<Record<FieldKey, string>>; other?: string[] }
  | { type: 'clearErrors' };

export function initReviewState(form: ReviewForm): ReviewState {
  return { form, errors: {}, otherErrors: [] };
}

/** The errors without `keys`, or the same object when none of them was set. */
function without(errors: ReviewState['errors'], ...keys: FieldKey[]): ReviewState['errors'] {
  if (!keys.some((k) => errors[k] != null)) return errors;
  const next = { ...errors };
  for (const k of keys) delete next[k];
  return next;
}

function updateLine(state: ReviewState, key: string, change: (line: FormLine) => FormLine, ...clear: FieldKey[]): ReviewState {
  let changed = false;
  const lines = state.form.lines.map((line) => {
    if (line.key !== key) return line;
    const next = change(line);
    if (next !== line) changed = true;
    return next;
  });
  if (!changed) return state;
  return { ...state, form: { ...state.form, lines }, errors: without(state.errors, ...clear) };
}

const setForm = (state: ReviewState, patch: Partial<ReviewForm>, ...clear: FieldKey[]): ReviewState => ({
  ...state, form: { ...state.form, ...patch }, errors: without(state.errors, ...clear),
});

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'reset':
      return initReviewState(action.form);

    case 'setSupplier':
      return setForm(state, { supplier: { id: action.supplier.id, name: action.supplier.name.trim() } }, 'supplier');

    case 'setInvoiceNumber':
      return setForm(state, { invoiceNumber: action.value }, 'invoiceNumber');

    case 'setPaymentStatus':
      return setForm(state, { paymentStatus: action.value }, 'paymentStatus');

    // Picking the invoice date also sets the stock-in date (the owner can change it after) and counts as
    // signing the date off: both as the cost app does.
    case 'setInvoiceDate':
      return setForm(state, {
        invoiceDate: action.value, invoiceDateRead: null, stockInDate: action.value, dateConfirmed: true,
      }, 'invoiceDate', 'stockInDate');

    case 'setStockInDate':
      return setForm(state, { stockInDate: action.value, dateConfirmed: true }, 'stockInDate');

    case 'confirmDate':
      return setForm(state, { dateConfirmed: true }, 'invoiceDate');

    case 'setLineNumber': {
      if (!isPlainDecimal(action.value)) return state;
      return updateLine(
        state, action.key,
        (line) => (line[action.field] === action.value ? line : { ...line, [action.field]: action.value }),
        lineField(action.key, action.field), lineField(action.key, 'row'), lineField(action.key, 'price'),
      );
    }

    // A new SKU means a new reference price, so an earlier "Ignore" no longer applies. The quantity is
    // counted in the SKU's unit from now on, as in the cost app.
    case 'setLineSku':
      return updateLine(state, action.key, (line) => ({
        ...line, sku: action.sku, unit: action.sku.unit ?? line.unit, ignoredDeviation: false,
      }), lineField(action.key, 'sku'), lineField(action.key, 'row'), lineField(action.key, 'price'));

    case 'toggleIgnore':
      return updateLine(state, action.key, (line) => ({ ...line, ignoredDeviation: !line.ignoredDeviation }),
        lineField(action.key, 'price'));

    // Appended, so every other line keeps its number on screen; the screen scrolls to it.
    case 'addLine':
      if (state.form.lines.some((l) => l.key === action.key)) return state;
      return {
        ...state,
        form: { ...state.form, lines: [...state.form.lines, blankLine(action.key)] },
        errors: without(state.errors, 'items'),
      };

    case 'removeLine': {
      const lines = state.form.lines.filter((l) => l.key !== action.key);
      if (lines.length === state.form.lines.length) return state;
      const prefix = `line:${action.key}:`;
      const errors = Object.fromEntries(Object.entries(state.errors).filter(([k]) => !k.startsWith(prefix)));
      return { ...state, form: { ...state.form, lines }, errors };
    }

    case 'setDelivery':
      if (!isPlainDecimal(action.value)) return state;
      return setForm(state, { delivery: action.value }, 'delivery');

    case 'resetDelivery':
      return setForm(state, { delivery: state.form.draftDelivery }, 'delivery');

    case 'setTaxOverride':
      if (!isPlainDecimal(action.value)) return state;
      return setForm(state, { taxOverride: action.value }, 'taxOverride');

    case 'resetTaxOverride':
      return setForm(state, { taxOverride: state.form.draftTaxOverride }, 'taxOverride');

    case 'setErrors':
      return { ...state, errors: action.errors, otherErrors: action.other ?? [] };

    case 'clearErrors':
      return { ...state, errors: {}, otherErrors: [] };

    default:
      return state;
  }
}

/**
 * One line's messages, keyed by part, with a stable object per line while its messages are unchanged
 * (so a card re-renders only when its own errors move). `cache` is kept by the caller across renders.
 */
export function lineErrorsSelector(
  errors: Partial<Record<FieldKey, string>>,
  cache: Map<string, { key: string; value: Partial<Record<string, string>> }>,
  lineKey: string,
): Partial<Record<string, string>> {
  const prefix = `line:${lineKey}:`;
  const value: Partial<Record<string, string>> = {};
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(prefix) && v) value[k.slice(prefix.length)] = v;
  const key = JSON.stringify(value);
  const hit = cache.get(lineKey);
  if (hit && hit.key === key) return hit.value;
  cache.set(lineKey, { key, value });
  return value;
}
