import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SkuRow } from '@/components/product/SkuRow';
import type { StorefrontSku } from '@/models/discovery';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

const sku: StorefrontSku = {
  offerId: 1, supplierSkuId: 77, skuName: 'Paneer', brandName: 'Nandini', packSize: '1', packUnit: 'KG',
  sellingPrice: '410.00', gstRate: '5', availability: 'AVAILABLE', availableQuantity: null, imageUrl: null,
  canonicalProductId: 7, canonicalProductName: 'Paneer', supplierStoreId: 4, supplierName: 'Metro',
  storeName: 'Metro store', distanceKm: '3.2', openNow: true, opensAt: null, preparationMinutes: 20,
  averageRating: null, ratingCount: 0, categoryId: 1, categoryName: 'Dairy', measureValue: null, measureUnit: null,
};

describe('SkuRow control', () => {
  it('ADD becomes a stepper when packs > 0', () => {
    const onChangePacks = jest.fn();
    const view = render(<SkuRow sku={sku} hideSupplier packs={0} onChangePacks={onChangePacks} />);

    fireEvent.press(screen.getByLabelText('Add Paneer'));
    expect(onChangePacks).toHaveBeenCalledWith(1);
    expect(screen.queryByLabelText(/Increase quantity/)).toBeNull();

    view.rerender(<SkuRow sku={sku} hideSupplier packs={2} onChangePacks={onChangePacks} />);
    expect(screen.queryByLabelText('Add Paneer')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Increase quantity/));
    expect(onChangePacks).toHaveBeenLastCalledWith(3);
    fireEvent.press(screen.getByLabelText(/Decrease quantity/));
    expect(onChangePacks).toHaveBeenLastCalledWith(1);
  });

  it('an out-of-stock row cannot be added', () => {
    const onChangePacks = jest.fn();
    render(<SkuRow sku={{ ...sku, availability: 'OUT_OF_STOCK' }} hideSupplier packs={0} onChangePacks={onChangePacks} />);
    fireEvent.press(screen.getByLabelText('Add Paneer'));
    expect(onChangePacks).not.toHaveBeenCalled();
  });

  it('rating badge hidden with zero ratings', () => {
    render(<SkuRow sku={{ ...sku, averageRating: '0.0', ratingCount: 0 }} onAdd={jest.fn()} />);
    expect(screen.queryByText('icon:star')).toBeNull();
    screen.unmount();
    render(<SkuRow sku={{ ...sku, averageRating: '4.2', ratingCount: 18 }} onAdd={jest.fn()} />);
    expect(screen.getByText('icon:star')).toBeTruthy();
  });
});
