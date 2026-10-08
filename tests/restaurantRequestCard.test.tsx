import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RestaurantRequestCard } from '@/components/request/RestaurantRequestCard';
import type { Intent } from '@/models/intent';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const request = (over: object) => ({
  id: 3, reference: 'RQ-3', storeName: 'Sri Balaji', supplierName: 'Sri Balaji', status: 'OPEN', fulfilment: 'AWAITING',
  withinOrderWindow: false, items: [{ id: 1, sku: null, requestedQuantity: '4' }], agreedTotal: '132.00', acceptance: null,
  sentAt: '2026-10-07T05:00:00Z', createdAt: '2026-10-07T05:00:00Z',
  ...over,
}) as unknown as Intent;

describe('the request card total', () => {
  it('shows the requested total before the supplier has answered', () => {
    render(<RestaurantRequestCard request={request({})} />);
    expect(screen.getByText('₹132.00')).toBeTruthy();
    expect(screen.getByText('Requested · 1 item')).toBeTruthy();
  });

  it('shows the accepted total once the supplier has answered', () => {
    render(<RestaurantRequestCard request={request({
      status: 'RESPONSES_RECEIVED', fulfilment: 'PARTIALLY_FULFILLED', withinOrderWindow: true,
      acceptance: { offeredTotal: '106.00' },
    })} />);
    expect(screen.getByText('₹106.00')).toBeTruthy();
    expect(screen.queryByText('₹132.00')).toBeNull();
    expect(screen.getByText('Accepted · 1 item')).toBeTruthy();
  });

  it('calls the action Place order', () => {
    render(<RestaurantRequestCard request={request({
      status: 'RESPONSES_RECEIVED', fulfilment: 'FULFILLED', withinOrderWindow: true, acceptance: { offeredTotal: '132.00' },
    })} />);
    expect(screen.getByText('Place order')).toBeTruthy();
    expect(screen.queryByText('Create Order')).toBeNull();
  });
});
