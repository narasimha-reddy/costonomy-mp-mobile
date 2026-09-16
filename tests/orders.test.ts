import {
  formatDistance,
  ITEM_NAMES_SHOWN,
  paymentMethodLabel,
  summariseItems,
} from '@/utils/orders';

const item = (skuName: string | null, productName = 'Canonical') =>
  ({ skuName, productName }) as { skuName: string; productName: string };

describe('summariseItems', () => {
  it('lists every name when they all fit', () => {
    expect(summariseItems([item('Butter'), item('Basmati Rice')]))
      .toBe('Butter, Basmati Rice');
  });

  it('counts only what is hidden, not the total', () => {
    // Six items, three shown — the reader can see three, so "+3" is the rest.
    const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => item(name));
    expect(summariseItems(six)).toBe('A, B, C +3');
  });

  it('shows no overflow at exactly the limit', () => {
    const three = ['A', 'B', 'C'].map((name) => item(name));
    expect(summariseItems(three)).toBe('A, B, C');
    expect(summariseItems(three)).not.toContain('+');
  });

  it('defaults to three names', () => {
    expect(ITEM_NAMES_SHOWN).toBe(3);
  });

  it('falls back to the canonical name when a SKU was never named', () => {
    expect(summariseItems([item(null as unknown as string, 'Paneer')])).toBe('Paneer');
  });

  it('falls back to a count when nothing is named at all', () => {
    // Better an honest "2 items" than an empty line pretending to be a list.
    const unnamed = [
      { skuName: null, productName: null },
      { skuName: null, productName: null },
    ] as unknown as { skuName: string; productName: string }[];
    expect(summariseItems(unnamed)).toBe('2 items');
  });

  it('says "1 item" in the singular', () => {
    const one = [{ skuName: null, productName: null }] as unknown as
      { skuName: string; productName: string }[];
    expect(summariseItems(one)).toBe('1 item');
  });
});

describe('paymentMethodLabel', () => {
  it('uses the words a supplier uses', () => {
    expect(paymentMethodLabel('PREPAID')).toBe('Prepaid');
    expect(paymentMethodLabel('CREDIT')).toBe('On credit');
  });

  it('returns null rather than a guess when the method is absent', () => {
    // An absent signal stays absent — a card must not claim "Prepaid" by default.
    expect(paymentMethodLabel(null)).toBeNull();
  });
});

describe('formatDistance', () => {
  it('shows one decimal at kilometre scale', () => {
    expect(formatDistance('4.25')).toBe('4.3 km');
    expect(formatDistance(12)).toBe('12.0 km');
  });

  it('switches to metres under a kilometre', () => {
    // "0.4 km" is a decimal a person has to convert; 400 m is the answer.
    expect(formatDistance('0.4')).toBe('400 m');
  });

  it('returns null when the distance is unknown', () => {
    // Unlocated is not nearby. "0 km" would say the order is next door.
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
  });

  it('returns null rather than NaN for a value it cannot read', () => {
    expect(formatDistance('not a number')).toBeNull();
  });
});
