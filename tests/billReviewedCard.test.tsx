import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { CheckBanner } from '@/components/wallet/bill/BillReading';
import { ReviewedReading } from '@/components/wallet/bill/ReviewedReading';
import { kostaDraft } from './fixtures/billReview';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
let mockMe: unknown = null;
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 't', me: mockMe }) }));

const AT = '2026-10-03T04:00:00Z';

describe('CheckBanner note (L2)', () => {
  it('shows the server reading total as a secondary note', () => {
    render(<CheckBanner check={{ paid: 2820, billTotal: 2820, matches: true, difference: 0, matchesReading: false, readingTotal: 3000 }} />);
    expect(screen.getByText('Bill total matches the payment (₹2,820)')).toBeTruthy();
    expect(screen.getByText('The bill as read was ₹3,000; you changed it')).toBeTruthy();
  });
  it('shows no note otherwise', () => {
    render(<CheckBanner check={{ paid: 2820, billTotal: 2820, matches: true, difference: 0, matchesReading: true, readingTotal: 2820 }} />);
    expect(screen.queryByText(/you changed it/)).toBeNull();
  });
});

describe('ReviewedReading attribution (L4)', () => {
  const card = (reviewedBy?: number | null) => <ReviewedReading review={kostaDraft({ reviewedAt: AT, reviewedBy })} />;
  it('says Edited by you for the same user', () => {
    mockMe = { user: { id: 7 } };
    render(card(7));
    expect(screen.getByText(/^Edited by you · 3 Oct 2026/)).toBeTruthy();
  });
  it('says Reviewed for another user', () => {
    mockMe = { user: { id: 7 } };
    render(card(8));
    expect(screen.getByText(/^Reviewed · 3 Oct 2026/)).toBeTruthy();
    expect(screen.queryByText(/Edited by you/)).toBeNull();
  });
  it('says Reviewed when reviewedBy is missing', () => {
    mockMe = { user: { id: 7 } };
    render(card(undefined));
    expect(screen.queryByText(/Edited by you/)).toBeNull();
    expect(screen.getByText(/^Reviewed · /)).toBeTruthy();
  });
  it('says Reviewed when me is missing', () => {
    mockMe = null;
    render(card(7));
    expect(screen.queryByText(/Edited by you/)).toBeNull();
    expect(screen.getByText(/^Reviewed · /)).toBeTruthy();
  });
  it('says plain Reviewed without a time', () => {
    mockMe = { user: { id: 7 } };
    render(<ReviewedReading review={kostaDraft({ reviewedAt: null, reviewedBy: 8 })} />);
    expect(screen.getAllByText('Reviewed')).toHaveLength(2); // the chip and the line
  });
});
