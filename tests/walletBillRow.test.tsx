import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { InvoiceRow } from '@/components/wallet/bill/InvoiceRow';
import { BillBanner } from '@/components/wallet/BillBanner';
import type { WalletBillStatus, WalletEntry } from '@/models/wallet';
import { TIME_CHIP_GAP, chipWidth, estimateTextWidth } from '@/lib/wallet/billChip';
import { BillChipLayout, BillChipType, DetailType, WalletType } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 2, fontScale: mockFontScale }),
}));
beforeEach(() => { mockFontScale = 1; });

const NOW = new Date('2026-09-29T12:00:00Z');
const STATUSES: WalletBillStatus[] = ['PENDING', 'READING', 'ADDED', 'REVIEWED', 'UNREADABLE'];
const FULL: Record<WalletBillStatus, string> = {
  PENDING: 'Bill pending', READING: 'Reading bill', ADDED: 'Bill added',
  REVIEWED: 'Bill reviewed', UNREADABLE: 'Check bill',
};

function entry(over: Partial<WalletEntry> = {}): WalletEntry {
  return {
    id: 5, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '85.0000', balanceAfter: '0',
    supplierOrderId: null, reason: 'Sharma Dairy', refundStatus: null, status: 'COMPLETED',
    instrument: null, at: '2026-09-29T08:00:00Z', ...over,
  };
}
const withBill = (status: WalletBillStatus) => entry({ bill: { status } });

describe('TransactionRow bill chip', () => {
  it('a row without a bill (null or absent) has no chip and the time is the plain meta text', () => {
    for (const e of [entry(), entry({ bill: null })]) {
      const { unmount } = render(<TransactionRow entry={e} now={NOW} />);
      expect(screen.queryByTestId('row-time-line')).toBeNull();
      expect(screen.queryByTestId('bill-chip-label')).toBeNull();
      const time = screen.getByText('4 hours ago');
      expect(StyleSheet.flatten(time.props.style)).toMatchObject({ ...WalletType.rowMeta });
      expect(time.props.numberOfLines).toBeUndefined();
      unmount();
    }
  });

  it.each(STATUSES)('shows the %s chip on the time line, one line, no wrapping', (status) => {
    render(<TransactionRow entry={withBill(status)} now={NOW} />);
    expect(screen.getByTestId(`bill-chip-${status}`)).toBeTruthy();
    expect(screen.getByLabelText(FULL[status])).toBeTruthy();
    const line = StyleSheet.flatten(screen.getByTestId('row-time-line').props.style);
    expect(line.flexWrap).toBeUndefined();
    expect(line).toMatchObject({ flexDirection: 'row', alignItems: 'center', flex: 1 });
    // Never clipped: the 22 dp chip hangs over the 12 dp text line (its negative margin), so
    // hiding overflow here would cut its top and bottom off.
    expect(line.overflow).toBeUndefined();
    const time = screen.getByText('4 hours ago');
    expect(time.props.numberOfLines).toBe(1);
    expect(time.props.ellipsizeMode).toBe('tail');
    expect(StyleSheet.flatten(time.props.style).flexShrink).toBe(1);
    fireEvent(screen.getByTestId('row-time-line'), 'layout',
      { nativeEvent: { layout: { x: 0, y: 0, width: 260, height: 12 } } });
    expect(screen.getByTestId('bill-chip-label').props.numberOfLines).toBe(1);
  });

  it('the time is never cut for the chip: its share of the line holds the whole time plus the icon', () => {
    for (const scale of [1, 1.3, 2]) {
      mockFontScale = scale;
      const { unmount } = render(<TransactionRow entry={withBill('REVIEWED')} now={NOW} />);
      const line = StyleSheet.flatten(screen.getByTestId('row-time-line').props.style);
      const need = estimateTextWidth('4 hours ago', WalletType.rowMeta.fontSize * scale, 'regular')
        + TIME_CHIP_GAP + chipWidth('icon', 'REVIEWED', scale);
      expect(line.minWidth).toBeCloseTo(need, 5);
      // The account words give way instead, on one line.
      const account = screen.getByText('Debited from wallet');
      expect(account.props.numberOfLines).toBe(1);
      expect(StyleSheet.flatten(account.props.style).flexShrink).toBe(1);
      expect(StyleSheet.flatten(account.parent!.parent!.props.style)).toMatchObject({ flexShrink: 1, minWidth: 0 });
      unmount();
    }
  });

  it('on a row narrower than the time and the icon, the time line takes the whole row less the gap', () => {
    mockFontScale = 2;
    render(<TransactionRow entry={withBill('PENDING')} now={NOW} />);
    fireEvent(screen.getByTestId('row-bill-line'), 'layout',
      { nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 12 } } });
    const line = StyleSheet.flatten(screen.getByTestId('row-time-line').props.style);
    expect(line.minWidth).toBe(80 - BillChipLayout.timeGap);
  });

  it('leaves room under the line for the chip overhang, unless a status chip already sits below', () => {
    const overhang = (BillChipLayout.height - WalletType.rowMeta.lineHeight) / 2;
    const { unmount } = render(<TransactionRow entry={withBill('ADDED')} now={NOW} />);
    expect(StyleSheet.flatten(screen.getByTestId('row-bill-line').props.style).marginBottom).toBe(overhang);
    unmount();
    render(<TransactionRow entry={entry({ bill: { status: 'ADDED' }, status: 'IN_PROGRESS' })} now={NOW} />);
    expect(StyleSheet.flatten(screen.getByTestId('row-bill-line').props.style).marginBottom).toBeUndefined();
  });

  it('a row without a bill keeps the account words exactly as before', () => {
    render(<TransactionRow entry={entry()} now={NOW} />);
    const account = screen.getByText('Debited from wallet');
    expect(account.props.numberOfLines).toBeUndefined();
  });

  it('keeps the time line at its old height: the chip margin cancels the extra', () => {
    render(<TransactionRow entry={withBill('PENDING')} now={NOW} />);
    const wrapper = screen.getByTestId('row-bill-chip');
    const style = StyleSheet.flatten(wrapper.props.style);
    expect(style.flexShrink).toBe(0);
    expect(style.marginVertical! * 2 + BillChipLayout.height).toBe(WalletType.rowMeta.lineHeight);
  });

  it('picks the chip shape from the measured line: icon when tight, short, then full', () => {
    render(<TransactionRow entry={withBill('PENDING')} now={NOW} />);
    const layout = (width: number) => fireEvent(screen.getByTestId('row-time-line'), 'layout',
      { nativeEvent: { layout: { x: 0, y: 0, width, height: 12 } } });
    layout(70);
    expect(screen.queryByTestId('bill-chip-label')).toBeNull();
    layout(150);
    expect(screen.getByText('Pending')).toBeTruthy();
    layout(220);
    expect(screen.getByText('Bill pending')).toBeTruthy();
  });

  it('at a big font scale the chip drops to the icon rather than squeeze the time', () => {
    mockFontScale = 2;
    render(<TransactionRow entry={withBill('PENDING')} now={NOW} />);
    fireEvent(screen.getByTestId('row-time-line'), 'layout',
      { nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 12 } } });
    expect(screen.queryByTestId('bill-chip-label')).toBeNull();
    expect(screen.getByLabelText('Bill pending')).toBeTruthy();
  });

  it('a pending chip opens Add bill only for someone who may add bills; otherwise the tap opens the row', () => {
    const onBillPress = jest.fn();
    const onPress = jest.fn();
    const e = withBill('PENDING');
    const { rerender } = render(<TransactionRow entry={e} now={NOW} onPress={onPress} onBillPress={onBillPress} />);
    fireEvent.press(screen.getByTestId('bill-chip-PENDING'));
    expect(onBillPress).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledWith(e);
    rerender(<TransactionRow entry={e} now={NOW} onPress={onPress} onBillPress={onBillPress} mayAddBill />);
    fireEvent.press(screen.getByTestId('bill-chip-PENDING'));
    expect(onBillPress).toHaveBeenCalledWith(e);
  });

  it.each(['READING', 'ADDED', 'REVIEWED', 'UNREADABLE'] as WalletBillStatus[])(
    'a %s chip opens the bill without any permission', (status) => {
      const onBillPress = jest.fn();
      const onPress = jest.fn();
      const e = withBill(status);
      render(<TransactionRow entry={e} now={NOW} onPress={onPress} onBillPress={onBillPress} />);
      fireEvent.press(screen.getByTestId(`bill-chip-${status}`));
      expect(onBillPress).toHaveBeenCalledWith(e);
      expect(onPress).not.toHaveBeenCalled();
    });

  it('inside a row the chip is not a button of its own (no button in a button); the row carries the action', () => {
    render(<TransactionRow entry={withBill('ADDED')} now={NOW} onPress={jest.fn()} onBillPress={jest.fn()} />);
    const chip = screen.getByTestId('bill-chip-ADDED');
    expect(chip.props.accessibilityRole).toBeUndefined();
    expect(chip.props.accessible).toBe(false);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('without onBillPress the chip only informs', () => {
    render(<TransactionRow entry={withBill('ADDED')} now={NOW} mayAddBill />);
    expect(screen.queryByRole('button', { name: 'Bill added' })).toBeNull();
    expect(screen.getByLabelText('Bill added')).toBeTruthy();
  });

  it('the row tap gets the entry; the spoken label ends with the bill words', () => {
    const onPress = jest.fn();
    const e = withBill('ADDED');
    render(<TransactionRow entry={e} now={NOW} onPress={onPress} />);
    const row = screen.getByLabelText(/Paid to Sharma Dairy.*, Bill added$/);
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith(e);
  });

  it('offers the chip tap as an accessibility action, named for what it does', () => {
    const onBillPress = jest.fn();
    const onPress = jest.fn();
    const e = withBill('PENDING');
    const { rerender } = render(
      <TransactionRow entry={e} now={NOW} onPress={onPress} onBillPress={onBillPress} mayAddBill />);
    const row = screen.getByLabelText(/Paid to Sharma Dairy.*Bill pending$/);
    expect(row.props.accessibilityActions).toEqual([{ name: 'bill', label: 'Add bill' }]);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'bill' } });
    expect(onBillPress).toHaveBeenCalledWith(e);

    const added = withBill('ADDED');
    rerender(<TransactionRow entry={added} now={NOW} onPress={onPress} onBillPress={onBillPress} />);
    expect(screen.getByLabelText(/Paid to Sharma Dairy.*Bill added$/).props.accessibilityActions)
      .toEqual([{ name: 'bill', label: 'Open bill' }]);

    rerender(<TransactionRow entry={e} now={NOW} onPress={onPress} onBillPress={onBillPress} />);
    expect(screen.getByLabelText(/Paid to Sharma Dairy.*Bill pending$/).props.accessibilityActions).toBeUndefined();
  });

  it('an unknown-to-the-row old caller still works: onPress receives the entry and may ignore it', () => {
    const onPress = jest.fn(() => undefined);
    render(<TransactionRow entry={entry()} now={NOW} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('InvoiceRow bill chip', () => {
  const invoice = { status: 'READ' as const, vendorName: 'Sharma Dairy', total: 85, thumbnailUrl: null };
  const layout = (width: number) => fireEvent(screen.getByTestId('invoice-title-line'), 'layout',
    { nativeEvent: { layout: { x: 0, y: 0, width, height: 22 } } });

  it('shows the full words until measured, then steps down rather than run into the chevron', () => {
    render(<InvoiceRow invoice={invoice} status="REVIEWED" onPress={() => {}} />);
    expect(screen.getByText('Bill reviewed')).toBeTruthy();
    const title = estimateTextWidth('Invoice', DetailType.name.fontSize, 'regular') + 8;
    layout(Math.ceil(title + chipWidth('full', 'REVIEWED', 1)));
    expect(screen.getByText('Bill reviewed')).toBeTruthy();
    layout(Math.ceil(title + chipWidth('short', 'REVIEWED', 1)));
    expect(screen.getByText('Reviewed')).toBeTruthy();
    layout(Math.floor(title + chipWidth('short', 'REVIEWED', 1)) - 1);
    expect(screen.queryByTestId('bill-chip-label')).toBeNull();
    expect(screen.getByLabelText('Bill reviewed')).toBeTruthy();
  });

  it('keeps the title whole; when not even the icon fits beside it, the chip moves under it', () => {
    render(<InvoiceRow invoice={invoice} status="ADDED" onPress={() => {}} />);
    const line = StyleSheet.flatten(screen.getByTestId('invoice-title-line').props.style);
    expect(line.flexWrap).toBe('wrap');
    expect(StyleSheet.flatten(screen.getByText('Invoice').props.style).flexShrink).toBe(0);
    const title = estimateTextWidth('Invoice', DetailType.name.fontSize, 'regular') + 8;
    // Too narrow for the icon beside the title, but the whole line holds the short word.
    const w = Math.floor(title + chipWidth('icon', 'ADDED', 1)) - 1;
    expect(w).toBeGreaterThanOrEqual(chipWidth('short', 'ADDED', 1));
    layout(w);
    expect(screen.getByTestId('bill-chip-label')).toBeTruthy();
  });
});

describe('BillBanner', () => {
  it('the active banner is as tall as the prompt: Clear gets its 44 dp target from slop, not height', () => {
    render(<BillBanner state={{ kind: 'active' }} onShow={() => {}} onClear={() => {}} />);
    const clear = screen.getByTestId('bill-banner-action');
    expect(StyleSheet.flatten(clear.props.style)?.minHeight).toBeUndefined();
    expect(clear.props.hitSlop.top * 2 + BillChipType.banner.lineHeight).toBe(BillChipLayout.bannerMinHeight);
  });
});
