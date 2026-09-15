import React from 'react';
import { Stack } from 'expo-router';
import { AuthGate } from '@/components/common';
import { OutletProvider } from '@/contexts/OutletProvider';
import { Colors } from '@/theme';

/**
 * The restaurant experience. Doc 05 §1.
 *
 * <p>`OutletProvider` sits above the navigator so the selected outlet survives
 * navigation between tabs and pushed screens. A cart, a requirement and an order
 * all belong to an outlet; resolving it per screen would let two screens disagree
 * about which one the user is looking at.
 */
export default function RestaurantLayout() {
  return (
    <AuthGate audiences={['RESTAURANT', 'BOTH']}>
      <OutletProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
      </OutletProvider>
    </AuthGate>
  );
}
