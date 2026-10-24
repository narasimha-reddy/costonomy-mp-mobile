import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TrackingScreenBody } from '@/components/delivery/TrackingScreenBody';

/** REST-ORDER-TRACK-01. Doc 05 §16. Everything it shows is in `TrackingScreenBody`, shared with the supplier's screen. */
export default function TrackingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <TrackingScreenBody audience="buyer" orderId={Number(orderId)} />;
}
