import React from 'react';
import { Stack } from 'expo-router';
import { AuthGate } from '@/components/common';
import { Colors } from '@/theme';

/** The supplier experience. Built out in M4. */
export default function SupplierLayout() {
  return (
    <AuthGate audiences={['SUPPLIER', 'BOTH']}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
    </AuthGate>
  );
}
