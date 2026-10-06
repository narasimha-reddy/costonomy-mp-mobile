import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CATCH_WEIGHT_ESTIMATE, CatchWeightNote } from '@/components/order';
import { SupplierSectionBody } from '@/components/restaurant/CartSupplierSection';
import type { Intent } from '@/models/intent';
import { INTENT_DRAFT_CATCH_WEIGHT, INTENT_DRAFT_ORDINARY } from './fixtures/catchWeightContract';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const noop = () => {};

function cart(draft: object) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SupplierSectionBody
        draft={draft as unknown as Intent} expanded sending={false} ordering={false}
        onChangeQuantity={noop} onRemove={noop} onSend={noop} onOrderDirectly={noop} onOpenSku={noop}
      />
    </SafeAreaProvider>,
  );
}

describe('the catch-weight disclosure', () => {
  it('says the price is an estimate that will never go up, in the words the spec gives', () => {
    expect(CATCH_WEIGHT_ESTIMATE).toBe('Estimated. The final price follows the scale weight and will never be more than this.');
  });

  it('says what was billed once the line is weighed', () => {
    render(<CatchWeightNote billed={9.6} unit="KG" />);
    expect(screen.getByText('Weighed and billed 9.6 KG')).toBeTruthy();
    expect(screen.queryByText(CATCH_WEIGHT_ESTIMATE)).toBeNull();
  });

  it('shows on a cart line sold by weight, from the flag the API now sends on the SKU', () => {
    cart(INTENT_DRAFT_CATCH_WEIGHT);
    expect(screen.getByText(CATCH_WEIGHT_ESTIMATE)).toBeTruthy();
  });

  it('does not show on an ordinary line', () => {
    cart(INTENT_DRAFT_ORDINARY);
    expect(screen.queryByText(CATCH_WEIGHT_ESTIMATE)).toBeNull();
  });
});
