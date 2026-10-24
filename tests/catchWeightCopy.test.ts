import {
  WEIGH_BEFORE_READY, WEIGHT_REQUIRED, buildWeighPayload, canWeigh, catchWeightLines, initialWeights,
  readyBlockedMessage, unweighedLines, weighedLine, weightAdjustmentCopy,
} from '@/lib/orders/catchWeight';
import type { SupplierOrder, SupplierOrderItem } from '@/models/procurement';
import {
  ORDER_CONFIRMED_UNWEIGHED, ORDER_PREPARING_WEIGHED_9_6, ORDER_READY_OVERWEIGHT_10_4, ORDER_READY_SETTLED_9_6,
  REFUSAL_EMPTY, REFUSAL_UNWEIGHED,
} from './fixtures/catchWeightContract';

const asOrder = (raw: object) => raw as unknown as SupplierOrder;
const firstItem = (raw: object) => asOrder(raw).items[0] as SupplierOrderItem;

describe('the weight adjustment sign: positive is a refund to the buyer (the server defines it)', () => {
  it('the API\'s Rs 42 is the buyer paying less, never "charged to the buyer"', () => {
    const copy = weightAdjustmentCopy(ORDER_READY_SETTLED_9_6.weightAdjustmentAmount);
    expect(copy).toEqual({ text: 'Weighed less: the buyer pays ₹42.00 less', refund: true });
  });

  it('a negative amount (old data only) is an extra charge, and zero or none says nothing', () => {
    expect(weightAdjustmentCopy(-15.5)).toEqual({ text: 'The buyer pays ₹15.50 more', refund: false });
    expect(weightAdjustmentCopy(0)).toBeNull();
    expect(weightAdjustmentCopy(ORDER_READY_OVERWEIGHT_10_4.weightAdjustmentAmount)).toBeNull();
    expect(weightAdjustmentCopy(null)).toBeNull();
  });
});

describe('when weighing is offered', () => {
  it('only before ready: the API refuses it from READY', () => {
    expect(canWeigh('CONFIRMED')).toBe(true);
    expect(canWeigh('PREPARING')).toBe(true);
    expect(canWeigh('READY_FOR_PICKUP')).toBe(false);
    expect(canWeigh('OUT_FOR_DELIVERY')).toBe(false);
  });
});

describe('the weigh sheet fields', () => {
  const unweighed = asOrder(ORDER_CONFIRMED_UNWEIGHED);

  it('start empty: the accepted quantity is not a reading nobody took', () => {
    expect(initialWeights(unweighed.items)).toEqual({ 301: '' });
  });

  it('start with the reading already taken when re-weighing', () => {
    expect(initialWeights(asOrder(ORDER_PREPARING_WEIGHED_9_6).items)).toEqual({ 301: '9.6' });
  });

  it('an empty or blank field is refused with the server\'s own sentence, and nothing is sent', () => {
    const items = unweighed.items;
    expect(buildWeighPayload(items, { 301: '' })).toEqual({ ok: false, message: WEIGHT_REQUIRED });
    expect(buildWeighPayload(items, { 301: '   ' })).toEqual({ ok: false, message: WEIGHT_REQUIRED });
    expect(WEIGHT_REQUIRED).toBe(REFUSAL_EMPTY.error.message);
  });

  it('sends every line as typed, in the API\'s body shape; the server judges the number', () => {
    expect(buildWeighPayload(unweighed.items, { 301: ' 9.6 ' })).toEqual({
      ok: true, weights: [{ supplierOrderItemId: 301, dispatchedWeight: '9.6' }],
    });
    // Out of band or too many decimals is not for the screen to decide.
    expect(buildWeighPayload(unweighed.items, { 301: '12' }).ok).toBe(true);
    expect(buildWeighPayload(unweighed.items, { 301: '9.6666' }).ok).toBe(true);
  });
});

describe('marking ready', () => {
  it('is blocked, with the sentence the server uses, while a catch-weight line is unweighed', () => {
    const preparing = { ...ORDER_CONFIRMED_UNWEIGHED, status: 'PREPARING' };
    expect(readyBlockedMessage(asOrder(preparing))).toBe(WEIGH_BEFORE_READY);
    expect(WEIGH_BEFORE_READY).toBe(REFUSAL_UNWEIGHED.error.message);
  });

  it('is open once every line is weighed, and for an order with no catch-weight lines', () => {
    expect(readyBlockedMessage(asOrder(ORDER_PREPARING_WEIGHED_9_6))).toBeNull();
    const plain = { ...ORDER_CONFIRMED_UNWEIGHED, status: 'PREPARING', items: [{ ...ORDER_CONFIRMED_UNWEIGHED.items[0], isCatchWeight: false }] };
    expect(readyBlockedMessage(asOrder(plain))).toBeNull();
  });

  it('a line with nothing accepted needs no weighing', () => {
    const declined = { ...ORDER_CONFIRMED_UNWEIGHED, status: 'PREPARING', items: [{ ...ORDER_CONFIRMED_UNWEIGHED.items[0], acceptedQuantity: 0 }] };
    expect(catchWeightLines(asOrder(declined))).toHaveLength(0);
    expect(unweighedLines(asOrder(declined))).toHaveLength(0);
  });
});

describe('the reading beside what is billed', () => {
  it('shows both, from the server\'s own fields', () => {
    expect(weighedLine(firstItem(ORDER_READY_SETTLED_9_6))).toBe('Scale 9.6 KG · billed 9.6 KG');
    expect(weighedLine(firstItem(ORDER_READY_OVERWEIGHT_10_4))).toBe('Scale 10.4 KG · billed 10 KG');
  });

  it('says only the reading when the server sent no billed quantity, and nothing before weighing', () => {
    const item: SupplierOrderItem = { ...firstItem(ORDER_PREPARING_WEIGHED_9_6), billableQuantity: null };
    expect(weighedLine(item)).toBe('Scale 9.6 KG');
    expect(weighedLine(firstItem(ORDER_CONFIRMED_UNWEIGHED))).toBeNull();
  });
});
