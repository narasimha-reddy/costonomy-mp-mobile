import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { MandiCard } from '@/components/common';
import { CreditDuesRow } from '@/components/credit/CreditDuesRow';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';
import { CreditLineRow } from '@/components/credit/CreditLineRow';
import { CreditClaimsSection } from '@/components/credit/CreditClaimsSection';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
afterEach(cleanup);

type TNode = { props: { style?: unknown }; children: (TNode | string)[] };
/** The first descendant that is the card body (the one with the card radius). */
function bodyUnder(node: TNode): Record<string, unknown> {
  const style = StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined;
  if (style?.borderRadius != null) return style;
  for (const child of node.children) {
    if (typeof child !== 'string') {
      const found = bodyUnder(child);
      if (found != null) return found;
    }
  }
  return undefined as never;
}
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

describe('MandiCard structure (blank-card hardening on Android)', () => {
  it('keeps a real native view for the card body', () => {
    render(<MandiCard testID="plain"><Text>x</Text></MandiCard>);
    expect(screen.getByTestId('plain').props.collapsable).toBe(false);
  });

  it('keeps the Pressable wrapper and its body un-collapsed when tappable', () => {
    render(<MandiCard testID="tap" onPress={() => undefined}><Text>x</Text></MandiCard>);
    const wrapper = screen.getByTestId('tap');
    expect(wrapper.props.collapsable).toBe(false);
    expect((wrapper.children as { props?: { collapsable?: boolean } }[]).some((c) => c.props?.collapsable === false)).toBe(true);
  });

  it('draws the accent as its own stripe and leaves the border uniform', () => {
    render(<MandiCard testID="acc" accentColor={Colors.info} outlined><Text>x</Text></MandiCard>);
    const body = flat('acc');
    expect(body.borderLeftWidth).toBeUndefined();
    expect(body.borderWidth).toBe(1);
    const stripe = flat('card-accent-acc');
    expect(stripe).toMatchObject({ position: 'absolute', width: 3, backgroundColor: Colors.info });
    expect(screen.getByTestId('card-accent-acc').props.collapsable).toBe(false);
  });

  it('has no stripe without an accent colour', () => {
    render(<MandiCard testID="none"><Text>x</Text></MandiCard>);
    expect(screen.queryByTestId('card-accent-none')).toBeNull();
  });
});

describe('credit list rows use the outlined card, not the shadow', () => {
  const expectOutlined = (style: Record<string, unknown>) => {
    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(Colors.border);
    expect(style.elevation).toBeUndefined();
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.borderLeftWidth).toBeUndefined();
    expect(style.overflow).toBe('hidden');
  };

  it('dues row, with a red stripe when overdue', () => {
    render(<CreditDuesRow agreement={{ id: 1, supplierName: 'A', due: '10', overdue: '5', status: 'ACTIVE' } as never} onPress={() => undefined} />);
    // The Pressable is the outer element; its first child is the card body.
    expectOutlined(bodyUnder(screen.getByTestId('dues-row-1') as never));
    expect(flat('card-accent-dues-row-1').backgroundColor).toBe(Colors.danger);
  });

  it('line row', () => {
    render(<CreditLineRow agreement={{ id: 2, supplierName: 'B', status: 'ACTIVE', available: '1' } as never} onPress={() => undefined} />);
    expectOutlined(bodyUnder(screen.getByTestId('line-row-2') as never));
  });

  it('invoice row, selected shows the primary stripe', () => {
    const invoice = {
      id: 3, invoiceNumber: 'INV-3', amount: '100', outstanding: '40', status: 'ISSUED', dueState: 'DUE_LATER', daysToDue: 5,
    } as never;
    render(<CreditInvoiceRow invoice={invoice} selected />);
    expectOutlined(flat('credit-invoice-3'));
    expect(flat('card-accent-credit-invoice-3').backgroundColor).toBe(Colors.primary);
  });

  it('claims section rows', () => {
    render(<CreditClaimsSection claims={[{ id: 5, amount: '10', status: 'SUBMITTED', method: 'UPI', paidOn: '2026-10-01' } as never]} supplierName="S" busy={false} offline={false} onWithdraw={async () => true} onReportAgain={() => undefined} />);
    expectOutlined(bodyUnder(screen.getByTestId('claim-5') as never));
  });
});
