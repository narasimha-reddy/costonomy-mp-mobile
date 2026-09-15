import React from 'react';
import { Stack } from 'expo-router';
import { AuthGate } from '@/components/common';
import { StoreProvider } from '@/contexts/StoreProvider';
import { Colors } from '@/theme';

/** The supplier experience. Doc 05 §23. */
export default function SupplierLayout() {
  return (
    <AuthGate audiences={['SUPPLIER', 'BOTH']}>
      <StoreProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
      </StoreProvider>
    </AuthGate>
  );
}
