import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';
import { OrderProgressHero } from '@/components/delivery/OrderProgressHero';
import { PartnerSearchPanel } from '@/components/delivery/PartnerSearchPanel';
import { ReportIssueCard } from '@/components/delivery/ReportIssueCard';
import { TrackingBanner } from '@/components/delivery/TrackingBanner';
import { canRetryPartner } from '@/lib/delivery/deliveryPartner';
import type { OrderTrackingView, TrackingDelivery } from '@/lib/delivery/orderTracking';
import { Spacing } from '@/theme';

/**
 * The cards every tracking surface shares, in the order the design gives them: the hero, the partner, then whatever
 * needs saying (a delay or change, the search, the way forward when none was found, how to report a problem).
 *
 * <p>Used by the tracking screen's sheet and at the top of both order detail screens, so the three cannot drift on
 * what a moment looks like. It renders what it is given; every button hands back to the caller, which owns the
 * mutation and waits for the server before anything changes.
 */
export function TrackingCards({
  audience, view, delivery, nowMs, onTrack, onReport, onRetry, onSwitchOwn, retrying = false, switching = false,
}: {
  audience: 'buyer' | 'supplier';
  view: OrderTrackingView;
  delivery: TrackingDelivery | null | undefined;
  nowMs: number;
  /** The supplier's "Track" button on the hero; omitted where the map preview already opens tracking. */
  onTrack?: () => void;
  /** Buyer only: to the dispute flow. Shown once the order has arrived. */
  onReport?: () => void;
  onRetry?: () => void;
  onSwitchOwn?: () => void;
  retrying?: boolean;
  switching?: boolean;
}) {
  const buyer = audience === 'buyer';
  const stopped = delivery != null && canRetryPartner(delivery.mode, delivery.status);
  const showSearch = view.search != null || (!buyer && stopped);
  const partnerName = delivery?.driverName ?? null;

  return (
    <View style={styles.stack}>
      <OrderProgressHero view={view} onTrack={onTrack} />
      {partnerName != null && view.showPartner && (
        <DeliveryPartnerCard
          name={partnerName}
          vehicle={delivery?.driverVehicle}
          phone={delivery?.driverPhone}
          showCall={view.showCall}
        />
      )}
      {partnerName != null && view.complete && !view.showPartner && (
        <DeliveryPartnerCard name={partnerName} vehicle={delivery?.driverVehicle} showCall={false} delivered />
      )}
      {view.banner != null && <TrackingBanner banner={view.banner} />}
      {showSearch && (
        <PartnerSearchPanel
          audience={audience}
          delivery={delivery ?? null}
          nowMs={nowMs}
          onRetry={buyer ? undefined : onRetry}
          onSwitchOwn={buyer ? undefined : onSwitchOwn}
          retrying={retrying}
          switching={switching}
        />
      )}
      {buyer && view.complete && onReport != null && <ReportIssueCard onReport={onReport} />}
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: Spacing.listGap - 2 } });
