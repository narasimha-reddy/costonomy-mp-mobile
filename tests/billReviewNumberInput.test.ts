import {
  groupForDisplay, readNumberInput, separatorMessage, toFieldText, type DecimalSeparator, type NumberRules,
} from '@/lib/wallet/numberInput';

const MONEY: NumberRules = { decimals: 2, maxInt: 10, separator: '.' };
const QTY: NumberRules = { decimals: 3, maxInt: 9, separator: '.' };
const COMMA_MONEY: NumberRules = { decimals: 2, maxInt: 10, separator: ',' };

type Row = [label: string, next: string, prev: string, rules: NumberRules, expected: { value: string; note?: string } | { message: string }];

const DOT = separatorMessage('.');

/**
 * Forty-four inputs, typed key by key (prev is the field one keystroke before) or pasted (prev is what
 * the field held), with what the field keeps or what it says instead.
 */
const ROWS: Row[] = [
  // Typing, on a phone that writes decimals with a dot.
  ['types a digit', '1', '', MONEY, { value: '1' }],
  ['a comma after 1 is refused, never read as 1.', '1,', '1', MONEY, { message: DOT }],
  ['a comma after 12 is refused', '12,', '12', MONEY, { message: DOT }],
  ['a comma typed inside the number is refused', '1,500', '1500', MONEY, { message: DOT }],
  ['types the point', '1.', '1', MONEY, { value: '1.' }],
  ['types a decimal', '1.5', '1.', MONEY, { value: '1.5' }],
  ['types a second decimal', '1.50', '1.5', MONEY, { value: '1.50' }],
  ['a third decimal on money is refused, not cut', '1.505', '1.50', MONEY, { message: 'Use at most 2 decimals' }],
  ['a second point is refused', '1.5.', '1.5', MONEY, { message: 'There is already a decimal point' }],
  ['an eleventh digit is refused, not cut', '12345678901', '1234567890', MONEY, { message: 'Use at most 10 digits before the point' }],
  ['a minus is refused', '-', '', MONEY, { message: 'Use digits only' }],
  ['a letter is refused', '12a', '12', MONEY, { message: 'Use digits only' }],
  ['deleting the last digit', '12', '125', MONEY, { value: '12' }],
  ['deleting everything', '', '5', MONEY, { value: '' }],
  ['leading zeros collapse', '007', '00', MONEY, { value: '7' }],
  ['a zero', '0', '', MONEY, { value: '0' }],
  // Pasted (or the whole selection replaced at once).
  ['pasted Western grouping is read, and says so', '1,500', '', MONEY, { value: '1500', note: 'Read as 1,500' }],
  ['pasted 12,000', '12,000', '', MONEY, { value: '12000', note: 'Read as 12,000' }],
  ['pasted Indian grouping with paise', '1,20,000.50', '', MONEY, { value: '120000.50', note: 'Read as 1,20,000.50' }],
  ['pasted Indian crore', '1,00,00,000', '', MONEY, { value: '10000000', note: 'Read as 1,00,00,000' }],
  ['pasted millions', '1,234,567', '', MONEY, { value: '1234567', note: 'Read as 1,234,567' }],
  ['pasted lakhs', '12,34,567', '', MONEY, { value: '1234567', note: 'Read as 12,34,567' }],
  ['pasted with ₹', '₹1,500', '', MONEY, { value: '1500', note: 'Read as 1,500' }],
  ['pasted 0,125 is ambiguous', '0,125', '', MONEY, { message: DOT }],
  ['pasted 1,5 is ambiguous', '1,5', '', MONEY, { message: DOT }],
  ['pasted 1,23 is ambiguous', '1,23', '', MONEY, { message: DOT }],
  ['pasted 1,2345 is no grouping', '1,2345', '', MONEY, { message: DOT }],
  ['pasted 123,45 is no grouping', '123,45', '', MONEY, { message: DOT }],
  ['pasted European 1.234,56 is refused', '1.234,56', '', MONEY, { message: DOT }],
  ['pasted Rs. 500', 'Rs. 500', '', MONEY, { value: '500' }],
  ['pasted with a unit is refused, not dropped', '2.5kg', '', QTY, { message: 'Use digits only' }],
  ['pasted 1e3 is refused', '1e3', '', MONEY, { message: 'Use digits only' }],
  ['pasted -5 is refused', '-5', '', MONEY, { message: 'Use digits only' }],
  ['pasted eleven digits are refused', '12345678901', '', MONEY, { message: 'Use at most 10 digits before the point' }],
  ['pasted 0.125 into money is refused, not cut to 0.12', '0.125', '', MONEY, { message: 'Use at most 2 decimals' }],
  ['pasted two points are refused', '1.2.3', '', MONEY, { message: 'Check the number: it has two decimal points' }],
  ['pasted with spaces', '  1500  ', '', MONEY, { value: '1500' }],
  ['pasted .5', '.5', '', MONEY, { value: '0.5' }],
  ['a typed figure replacing the selection', '1500', '1120', MONEY, { value: '1500' }],
  ['pasted "1.5k" is refused: a magnitude word', '1.5k', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2L" is refused: a magnitude word', '2L', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1.5 lakh" is refused: a magnitude word', '1.5 lakh', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "5 cr" is refused: a magnitude word', '5 cr', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "3 k" is refused: a magnitude word', '3 k', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2 lakhs" is refused: a magnitude word', '2 lakhs', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2 lac" is refused: a magnitude word', '2 lac', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1 crore" is refused: a magnitude word', '1 crore', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "5 thousand" is refused: a magnitude word', '5 thousand', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2m" is refused: a magnitude word', '2m', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2 mn" is refused: a magnitude word', '2 mn', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1 million" is refused: a magnitude word', '1 million', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1 b" is refused: a magnitude word', '1 b', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1bn" is refused: a magnitude word', '1bn', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2K" is refused: a magnitude word', '2K', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1.5 Lakh" is refused: a magnitude word', '1.5 Lakh', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "1.5 CR" is refused: a magnitude word', '1.5 CR', '', MONEY, { message: 'Type the full amount' }],
  ['pasted "2.5 kg" is refused: other letters', '2.5 kg', '', MONEY, { message: 'Use digits only' }],
  ['pasted "12abc" is refused: other letters', '12abc', '', MONEY, { message: 'Use digits only' }],
  ['pasted "5 pcs" is refused: other letters', '5 pcs', '', MONEY, { message: 'Use digits only' }],
  ['pasted "5x" is refused: other letters', '5x', '', MONEY, { message: 'Use digits only' }],
  ['pasted "Rs. 1,500" keeps only a currency marker', 'Rs. 1,500', '', MONEY, { value: '1500', note: 'Read as 1,500' }],
  ['pasted "₹1500" keeps only a currency marker', '₹1500', '', MONEY, { value: '1500' }],
  ['pasted "1500 INR" keeps only a currency marker', '1500 INR', '', MONEY, { value: '1500' }],
  ['pasted "INR 1,20,000" keeps only a currency marker', 'INR 1,20,000', '', MONEY, { value: '120000', note: 'Read as 1,20,000' }],
  ['pasted "Rs 500" keeps only a currency marker', 'Rs 500', '', MONEY, { value: '500' }],
  ['pasted "1500/-" keeps only a currency marker', '1500/-', '', MONEY, { value: '1500' }],
  ['pasted "1,500 rs." keeps only a currency marker', '1,500 rs.', '', MONEY, { value: '1500', note: 'Read as 1,500' }],
  ['pasted "inr 99" keeps only a currency marker', 'inr 99', '', MONEY, { value: '99' }],
  ['deleting the minus of a pre-filled -50', '50', '-50', MONEY, { value: '50' }],
  ['deleting a digit of a pre-filled -50 drops the sign', '-0', '-50', MONEY, { value: '0' }],
  ['clearing a pre-filled -50', '', '-50', MONEY, { value: '' }],
  ['typing 50 after clearing', '50', '5', MONEY, { value: '50' }],
  // Quantities: three places, nine digits.
  ['quantity 0,125 pasted is ambiguous', '0,125', '', QTY, { message: DOT }],
  ['quantity 0.125', '0.125', '', QTY, { value: '0.125' }],
  ['a tenth quantity digit is refused', '1234567890', '123456789', QTY, { message: 'Use at most 9 digits before the point' }],
  // A phone that writes decimals with a comma.
  ['comma phone: a typed comma is the point', '1,', '1', COMMA_MONEY, { value: '1.' }],
  ['comma phone: a typed dot is refused', '1.', '1', COMMA_MONEY, { message: 'Use a comma for decimals' }],
  ['comma phone: pasted 1.500 is grouping', '1.500', '', COMMA_MONEY, { value: '1500', note: 'Read as 1.500' }],
  ['comma phone: pasted 1,5', '1,5', '', COMMA_MONEY, { value: '1.5' }],
];

describe('number fields never guess at a comma (H1)', () => {
  it('has the table of at least forty inputs', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(40);
  });

  it.each(ROWS)('%s: %p after %p', (_label, next, prev, rules, expected) => {
    const read = readNumberInput(next, prev, rules);
    if ('message' in expected) {
      expect(read).toEqual({ ok: false, message: expected.message });
    } else {
      expect(read).toEqual({ ok: true, value: expected.value, note: expected.note ?? null });
    }
  });

  it('typing "1,500" key by key never lands on 1.50: it is refused at the comma and ends as 1500', () => {
    let value = '';
    const messages: string[] = [];
    for (const key of ['1', ',', '5', '0', '0']) {
      const read = readNumberInput(toFieldText(value, '.') + key, toFieldText(value, '.'), MONEY);
      if (read.ok) value = read.value;
      else messages.push(read.message);
    }
    expect(value).toBe('1500');
    expect(messages).toEqual([DOT]);
  });

  it('nothing changes a figure without saying so: whenever the other separator is in the text, the value is refused or comes with a note', () => {
    const alphabet = ['0', '1', '2', '5', '9', '.', ','];
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    for (const sep of ['.', ','] as DecimalSeparator[]) {
      const group = sep === '.' ? ',' : '.';
      for (let i = 0; i < 3000; i++) {
        const length = 1 + Math.floor(random() * 9);
        const text = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
        const rules = { decimals: 2, maxInt: 10, separator: sep };
        for (const prev of ['', text.slice(0, -1)]) {
          const read = readNumberInput(text, prev, rules);
          if (read.ok && text.includes(group)) {
            expect(read.note).toBe(`Read as ${text}`);
            // And the note's reading is the plain number with the grouping taken out.
            expect(read.value.replace('.', sep)).toBe(text.split(group).join('').replace(/^0+(?=\d)/, ''));
          }
          if (read.ok && !text.includes(group)) {
            // No grouping: the value is the text with the phone's separator as the point, nothing dropped.
            expect(Number(`0${read.value}`)).toBeCloseTo(Number(`0${text.replace(sep, '.')}`), 10);
          }
        }
      }
    }
  });

  it('a pasted figure with trailing letters is never read as a bare number (L1 fuzz)', () => {
    let seed = 11;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    const pick = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)] as T;
    const letters = ['k', 'K', 'L', 'l', 'lakh', 'Lakhs', 'lac', 'cr', 'Cr', 'crore', 'thousand', 'm', 'mn', 'kg', 'x', 'abc', 'KGS', 'b'];
    const markers = ['rs', 'Rs', 'RS', 'rs.', 'INR', 'inr'];
    for (let i = 0; i < 3000; i++) {
      const digits = String(1 + Math.floor(random() * 9999));
      const dec = random() < 0.4 ? `.${Math.floor(random() * 90) + 10}` : '';
      const figure = `${digits}${dec}`;
      const gap = random() < 0.5 ? ' ' : '';
      const word = pick(letters);
      for (const rules of [MONEY, QTY]) {
        const read = readNumberInput(`${figure}${gap}${word}`, '', rules);
        expect(read.ok).toBe(false);
        // Letters before the number are refused too, unless a currency marker.
        const lead = readNumberInput(`${word}${gap}${figure}`, '', rules);
        expect(lead.ok).toBe(false);
      }
      const marker = pick(markers);
      const suffixed = readNumberInput(`${figure}${gap}${marker}`, '', MONEY);
      expect(suffixed.ok && suffixed.value).toBe(figure);
      const prefixed = readNumberInput(`${marker}${gap}${figure}`, '', MONEY);
      expect(prefixed.ok && prefixed.value).toBe(figure);
    }
  });

  it('groups for display only, the Indian way, with the phone’s separator', () => {
    expect(groupForDisplay('1500')).toBe('1,500');
    expect(groupForDisplay('120000.5')).toBe('1,20,000.5');
    expect(groupForDisplay('10000000')).toBe('1,00,00,000');
    expect(groupForDisplay('999')).toBe('999');
    expect(groupForDisplay('')).toBe('');
    expect(groupForDisplay('12.')).toBe('12.');
    expect(groupForDisplay('1500.5', ',')).toBe('1.500,5');
    expect(toFieldText('1500.5', ',')).toBe('1500,5');
  });
});
