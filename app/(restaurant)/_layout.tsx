import React from 'react';
import { Stack } from 'expo-router';
import { AuthGate } from '@/components/common';
import { Colors } from '@/theme';

/**
 * The restaurant experience. v2.2 §21's navigation lands here in M2; for now the
 * group exists so routing has a real destination to resolve to.
 */
export default function RestaurantLayout() {
  return (
    <AuthGate audiences={['RESTAURANT', 'BOTH']}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
    </AuthGate>
  );
}
