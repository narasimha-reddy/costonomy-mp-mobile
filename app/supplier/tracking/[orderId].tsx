import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TrackingScreenBody } from '@/components/delivery/TrackingScreenBody';

/** The supplier's view of the same tracking screen. Doc 05 §16. */
export default function SupplierTrackingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <TrackingScreenBody audience="supplier" orderId={Number(orderId)} />;
}
