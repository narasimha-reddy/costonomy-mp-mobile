import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});

describe('DeliveryPartnerCard (restyled)', () => {
  it('shows name, Delivery partner and a call button only with a phone', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { rerender } = render(<DeliveryPartnerCard name="Ravi Kumar" phone="9999999999" showCall />);
    expect(screen.getByText('Ravi Kumar')).toBeTruthy();
    expect(screen.getByText('Delivery partner')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Call Ravi Kumar'));
    expect(open).toHaveBeenCalledWith('tel:9999999999');
    rerender(<DeliveryPartnerCard name="Ravi Kumar" phone={null} showCall />);
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
    rerender(<DeliveryPartnerCard name="Ravi Kumar" phone="" showCall />);
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
    rerender(<DeliveryPartnerCard name="Ravi Kumar" phone="9999999999" showCall={false} />);
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
  });

  it('placeholder renders title and body without a call', () => {
    render(
      <DeliveryPartnerCard
        name={null}
        phone="9999999999"
        showCall
        placeholder={{ title: 'Still arranging delivery', body: 'Your supplier is on it.' }}
      />,
    );
    expect(screen.getByText('Still arranging delivery')).toBeTruthy();
    expect(screen.getByText('Your supplier is on it.')).toBeTruthy();
    expect(screen.queryByLabelText(/Call/)).toBeNull();
    expect(screen.queryByText('Delivery partner')).toBeNull();
  });

  it('renders nothing without a name or a placeholder', () => {
    render(<DeliveryPartnerCard name={null} showCall={false} />);
    expect(screen.queryByText('Delivery partner')).toBeNull();
  });

  it('delivered reads Delivered by and has no call', () => {
    render(<DeliveryPartnerCard name="Ravi Kumar" phone="9999999999" showCall delivered />);
    expect(screen.getByText('Delivered by Ravi Kumar')).toBeTruthy();
    expect(screen.queryByLabelText(/Call/)).toBeNull();
  });

  it('buyer card shows no vehicle', () => {
    render(<DeliveryPartnerCard name="Ravi Kumar" phone="9999999999" showCall />);
    expect(screen.queryByText(/KA \d\d/)).toBeNull();
    expect(screen.queryByText(/vehicle|rating|tip/i)).toBeNull();
  });
});
