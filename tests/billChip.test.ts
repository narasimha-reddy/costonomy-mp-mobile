import {
  CHIP_TEXT_MAX_SCALE, TIME_CHIP_GAP, billChipCopy, billChipTone, chipVariant, chipWidth,
  chooseBillChip, estimateTextWidth, initialTimeLineWidth, type ChipVariant,
} from '@/lib/wallet/billChip';
import { BILL_STATUSES } from '@/models/wallet';
import { BillChipLayout, BillStatusColors, WalletType } from '@/theme';

describe('billChipCopy', () => {
  it('has full, short and screen-reader words for all five statuses', () => {
    expect(BILL_STATUSES.map((s) => billChipCopy(s))).toEqual([
      { full: 'Bill pending', short: 'Pending', a11y: 'Bill pending' },
      { full: 'Reading bill', short: 'Reading', a11y: 'Reading bill' },
      { full: 'Bill added', short: 'Added', a11y: 'Bill added' },
      { full: 'Bill reviewed', short: 'Reviewed', a11y: 'Bill reviewed' },
      { full: 'Check bill', short: 'Check', a11y: 'Check bill' },
    ]);
  });
});

describe('billChipTone', () => {
  it('points every status at real colour tokens and the right icon', () => {
    for (const status of BILL_STATUSES) {
      const tone = billChipTone(status);
      expect(BillStatusColors).toHaveProperty(tone.bg);
      expect(BillStatusColors).toHaveProperty(tone.text);
      if (tone.border != null) expect(BillStatusColors).toHaveProperty(tone.border);
    }
    expect(billChipTone('PENDING')).toEqual({ bg: 'pendingBg', text: 'pendingText', border: 'pendingBorder', icon: 'dot' });
    expect(billChipTone('READING')).toEqual({ bg: 'readingBg', text: 'readingText', border: null, icon: 'dots' });
    expect(billChipTone('ADDED')).toEqual({ bg: 'addedBg', text: 'addedText', border: null, icon: { name: 'checkmark' } });
    expect(billChipTone('REVIEWED')).toEqual({ bg: 'reviewedBg', text: 'reviewedText', border: null, icon: { name: 'checkmark-done' } });
    expect(billChipTone('UNREADABLE')).toEqual({ bg: 'checkBg', text: 'checkText', border: null, icon: { name: 'alert' } });
  });
});

describe('estimateTextWidth', () => {
  it('is wider for wider letters, bold and bigger text, and always generous', () => {
    expect(estimateTextWidth('mm', 11, 'regular')).toBeGreaterThan(estimateTextWidth('ii', 11, 'regular'));
    expect(estimateTextWidth('Pending', 11, 'semibold')).toBeGreaterThan(estimateTextWidth('Pending', 11, 'regular'));
    expect(estimateTextWidth('Pending', 22, 'regular')).toBeCloseTo(2 * estimateTextWidth('Pending', 11, 'regular'), 5);
    expect(estimateTextWidth('', 11, 'regular')).toBe(0);
    // "P" .62 + "ending" (.52 x4 + .27 + .52 -> e n d i n g) = 0.62 + 0.52*5 + 0.27 = 3.49 em, x 1.04 x 1.08 at 11 sp
    expect(estimateTextWidth('Pending', 11, 'semibold')).toBeCloseTo(3.49 * 11 * 1.04 * 1.08, 4);
  });
});

describe('chipWidth', () => {
  it('is the 22 dp circle for the icon and padding + icon + gap + label otherwise', () => {
    expect(chipWidth('icon', 'PENDING', 1)).toBe(BillChipLayout.height);
    const label = estimateTextWidth('Pending', 11, 'semibold');
    expect(chipWidth('short', 'PENDING', 1)).toBeCloseTo(18 + 12 + 4 + label + 2, 5); // pending has a border
    expect(chipWidth('short', 'ADDED', 1)).toBeCloseTo(18 + 12 + 4 + estimateTextWidth('Added', 11, 'semibold'), 5);
  });
  it('stops growing the label past 1.3x text', () => {
    expect(chipWidth('full', 'ADDED', 2)).toBe(chipWidth('full', 'ADDED', CHIP_TEXT_MAX_SCALE));
    expect(chipWidth('full', 'ADDED', 1.3)).toBeGreaterThan(chipWidth('full', 'ADDED', 1));
  });
});

describe('chipVariant', () => {
  it('prefers full, then short, then squeezing the time, then the icon', () => {
    const full = chipWidth('full', 'ADDED', 1);
    const short = chipWidth('short', 'ADDED', 1);
    expect(chipVariant(full, 1, 'ADDED')).toBe('full');
    expect(chipVariant(full - 1, 1, 'ADDED')).toBe('short');
    expect(chipVariant(short - 1, 1, 'ADDED')).toBe('icon');
    expect(chipVariant(short - 1, 1, 'ADDED', 5)).toBe('short');
    expect(chipVariant(short - 10, 1, 'ADDED', 5)).toBe('icon');
  });
  it('never squeezes the time at big text', () => {
    const short = chipWidth('short', 'ADDED', 2);
    expect(chipVariant(short - 1, 2, 'ADDED', 100)).toBe('icon');
  });
});

describe('initialTimeLineWidth', () => {
  it('is the window less the row furniture and the account text', () => {
    expect(initialTimeLineWidth(360, 1)).toBeGreaterThan(60);
    expect(initialTimeLineWidth(360, 1)).toBeLessThan(160);
    expect(initialTimeLineWidth(360, 2)).toBeLessThan(initialTimeLineWidth(360, 1));
  });
});

// ── The table ─────────────────────────────────────────────────────────

const WIDTHS = Array.from({ length: 15 }, (_, i) => 120 + i * 10);
const SCALES = [1, 1.3, 2.0];
const TIMES = ['2 min ago', '20 hours ago', '30 Sept 2025', '3 months ago'];
const ORDER: Record<ChipVariant, number> = { icon: 0, short: 1, full: 2 };

interface Cell { lineWidth: number; scale: number; status: (typeof BILL_STATUSES)[number]; time: string; v: ChipVariant; timeW: number }

const CELLS: Cell[] = [];
for (const lineWidth of WIDTHS) for (const scale of SCALES) for (const status of BILL_STATUSES) for (const time of TIMES) {
  CELLS.push({
    lineWidth, scale, status, time,
    v: chooseBillChip({ lineWidth, timeText: time, fontScale: scale, status }),
    timeW: estimateTextWidth(time, WalletType.rowMeta.fontSize * scale, 'regular'),
  });
}
const count = (v: ChipVariant) => CELLS.filter((c) => c.v === v).length;

describe(`chip variant table: ${CELLS.length} cases, ${count('full')} full, ${count('short')} short, ${count('icon')} icon`, () => {
  it('has 15 widths x 3 scales x 5 statuses x 4 times', () => {
    expect(CELLS).toHaveLength(15 * 3 * 5 * 4);
  });

  it('(a) the chosen variant plus the gap always fits the line, icon included', () => {
    const bad = CELLS.filter((c) => chipWidth(c.v, c.status, c.scale) + TIME_CHIP_GAP > c.lineWidth);
    expect(bad).toEqual([]);
  });

  it('(b) and (c) the time is never cut for the chip, at any text size', () => {
    const bad = CELLS.filter((c) => c.v !== 'icon'
      && chipWidth(c.v, c.status, c.scale) + TIME_CHIP_GAP + c.timeW > c.lineWidth);
    expect(bad).toEqual([]);
  });

  it('(d) a wider line never gives a smaller variant', () => {
    const bad = CELLS.filter((c) => {
      const wider = CELLS.find((o) => o.lineWidth === c.lineWidth + 10 && o.scale === c.scale
        && o.status === c.status && o.time === c.time);
      return wider != null && ORDER[wider.v] < ORDER[c.v];
    });
    expect(bad).toEqual([]);
  });

  it('(e) the icon is chosen only when the short words cannot fit beside the whole time', () => {
    const bad = CELLS.filter((c) => c.v === 'icon'
      && chipWidth('short', c.status, c.scale) + TIME_CHIP_GAP + c.timeW <= c.lineWidth);
    expect(bad).toEqual([]);
  });

  it('uses all three shapes across the table', () => {
    expect(count('full')).toBeGreaterThan(0);
    expect(count('short')).toBeGreaterThan(0);
    expect(count('icon')).toBeGreaterThan(0);
  });
});
