import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MandiHeader } from '@/components/common/MandiHeader';
import { MandiQuantityStepper } from '@/components/common/MandiQuantityStepper';
import { DeliveryOfferChoice } from '@/components/request/DeliveryOfferChoice';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier',
}));

describe('accessibility labels', () => {
  it('the header back button is named Back', () => {
    render(<MandiHeader title="Order" back />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('stepper buttons name the item', () => {
    render(<MandiQuantityStepper value={2} onChange={jest.fn()} itemLabel="Paneer" />);
    expect(screen.getByLabelText('Increase quantity of Paneer')).toBeTruthy();
    expect(screen.getByLabelText('Decrease quantity of Paneer')).toBeTruthy();
  });

  it('delivery offer options are radios that expose checked', () => {
    render(
      <DeliveryOfferChoice
        policy={{ costonomyDeliveryEnabled: true } as never}
        value="COSTONOMY"
        onChange={jest.fn()}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(radios.filter((r) => r.props.accessibilityState?.checked === true)).toHaveLength(1);
    expect(radios.filter((r) => r.props.accessibilityState?.checked === false).length).toBe(radios.length - 1);
  });
});
