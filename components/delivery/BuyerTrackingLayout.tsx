import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionProvider';
import { MandiChatAction, MandiHeader, MandiText } from '@/components/common';
import { DetailRowCard, type DetailRow } from '@/components/common/DetailRowCard';
import { CollapsibleSection } from '@/components/order/CollapsibleSection';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';
import { DeliveryTimeline } from '@/components/delivery/DeliveryTimeline';
import { ReceiptHero } from '@/components/delivery/ReceiptHero';
import { ReportIssueCard } from '@/components/delivery/ReportIssueCard';
import { GreenTrackingHeader } from '@/components/delivery/GreenTrackingHeader';
import { MandiMap } from '@/components/delivery/MandiMap';
import { OrderPlacedHero } from '@/components/delivery/OrderPlacedHero';
import { TrackingBanner } from '@/components/delivery/TrackingBanner';
import { isApiError } from '@/lib/api/errors';
import { clockTime } from '@/lib/delivery/deliveryPartner';
import { haversineM, toLatLng, type LatLng } from '@/lib/delivery/mapGeometry';
import { stagesFor, type OrderTrackingView } from '@/lib/delivery/orderTracking';
import { buyerTrackingHeader, placeholderCopy } from '@/lib/delivery/trackingHeader';
import type { Delivery } from '@/models/delivery';
import type { SupplierOrder } from '@/models/procurement';
import { fetchRating } from '@/services/trust';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TrackLayout } from '@/theme';

function point(loc: { latitude: string | number; longitude: string | number } | null | undefined): LatLng | null {
  if (loc == null) return null;
  const latitude = Number(loc.latitude);
  const longitude = Number(loc.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

const SEARCH_BAR_HEIGHT = 5;
/** How much of the indeterminate bar is drawn; static, so reduced motion needs nothing special. */
const SEARCH_BAR_FILL = '35%';

/** "850 m" under a kilometre, else "2.4 km". Display only: the arithmetic is the haversine in mapGeometry. */
function distanceText(metres: number): string {
  return metres < 1000 ? `${Math.max(1, Math.round(metres))} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * The buyer's live tracking screen (restyle spec 4.A): the green header, the map, then the cards.
 *
 * <p>Every decision about what to show comes from `buyerTrackingHeader`; this component only lays it out and wires
 * the taps. Delivered and completed draw the receipt (restyle spec 4.B) instead of the map. Where the placeholder would read as a promise that cannot be kept (a pickup
 * or the supplier's own delivery has no partner to assign) the "we'll assign a partner soon" pill is left out.
 */
export function BuyerTrackingLayout({
  order, delivery, view, nowMs, outlet, onRefresh, refreshing, onBack, help,
}: {
  order: SupplierOrder;
  delivery: Delivery | null;
  view: OrderTrackingView;
  nowMs: number;
  outlet: { latitude: number; longitude: number } | null;
  onRefresh: () => void;
  refreshing: boolean;
  onBack: () => void;
  help: React.ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useSession();

  // The drop: the server's own coordinates when it sends them (API B1), else the outlet the app already knows.
  const drop: LatLng | null = point(delivery?.dropLocation) ?? outlet;
  const header = buyerTrackingHeader({ view, order, delivery, drop, nowMs });
  const supplier = header.supplierLine;
  // Only a COMPLETED order can be rated (the API refuses otherwise). A GET: the row shows on a 404, "not rated yet".
  const receipt = header.layout === 'receipt';
  const rating = useQuery({
    queryKey: ['supplier-order', order.id, 'rating'],
    queryFn: () => fetchRating(accessToken as string, order.id),
    enabled: receipt && order.status === 'COMPLETED' && accessToken != null,
    retry: (count, error) => !isApiError(error) && count < 2,
  });
  const unrated = rating.isError && isApiError(rating.error) && rating.error.status === 404;
  const scrollProps = {
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />,
  };

  if (header.layout === 'placed') {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top, backgroundColor: Colors.surface }}>
          <MandiHeader title="Tracking" subtitle={order.orderNumber} back onBack={onBack} right={help} />
        </View>
        <ScrollView contentContainerStyle={styles.grow} {...scrollProps}>
          <OrderPlacedHero
            placedAt={order.createdAt ?? null}
            supplier={supplier}
            outletName={order.outletName ?? 'Your outlet'}
            address={delivery?.dropAddress ?? ([order.outletName, order.outletLocality].filter(Boolean).join(', ') || null)}
            segments={view.segments}
            segmentIndex={view.segmentIndex}
          />
        </ScrollView>
      </View>
    );
  }

  if (receipt) {
    const outletLabel = order.outletName ?? 'your outlet';
    const address = delivery?.dropAddress ?? ([order.outletName, order.outletLocality].filter(Boolean).join(', ') || null);
    const at = clockTime(delivery?.deliveredAt);
    const orderSummary = `${order.items.length} ${order.items.length === 1 ? 'item' : 'items'} · ${formatMoney(order.totalAmount)}`;
    const canChatHere = order.outletId != null && order.supplierStoreId != null;
    const rateRow: DetailRow[] = unrated ? [{
      key: 'rate',
      icon: 'star-outline',
      title: 'Rate this order',
      subtitle: 'Quality, packaging and delivery',
      right: <MandiText variant="caption" color={Colors.textSecondary}>›</MandiText>,
      onPress: () => router.push(`/restaurant/rating/${order.id}`),
    }] : order.status === 'DELIVERED' ? [{
      key: 'checkin',
      icon: 'star-outline',
      title: 'Check in the delivery to rate it',
    }] : [];
    const supplierRows = (chatRow: DetailRow | null): DetailRow[] => [
      ...(chatRow ? [chatRow] : [{ key: 'supplier', icon: 'storefront-outline' as const, title: order.storeName ?? supplier }]),
      ...rateRow,
    ];
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top, backgroundColor: Colors.surface }}>
          <MandiHeader title="Tracking" subtitle={supplier} back onBack={onBack} right={help} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} {...scrollProps}>
          <ReceiptHero title={`Order delivered at ${outletLabel}`} subtitle={at != null ? `Delivered at ${at}` : null} />
          <View style={styles.cards}>
            {canChatHere ? (
              <MandiChatAction
                outletId={order.outletId}
                supplierStoreId={order.supplierStoreId}
                side="RESTAURANT"
                suggest={{ type: 'ORDER', id: order.id }}
              >
                {({ onPress, label }) => (
                  <DetailRowCard
                    rows={supplierRows({
                      key: 'supplier',
                      icon: 'chatbubble-outline',
                      title: order.storeName ?? supplier,
                      subtitle: 'Message about this order',
                      onPress,
                      accessibilityLabel: label,
                    })}
                  />
                )}
              </MandiChatAction>
            ) : (
              <DetailRowCard rows={supplierRows(null)} />
            )}
            {delivery?.driverName != null && (
              <DeliveryPartnerCard name={delivery.driverName} showCall={false} delivered />
            )}
            <DetailRowCard
              rows={[
                { key: 'drop', icon: 'location-outline', title: `Delivery at ${outletLabel}`, subtitle: address },
                {
                  key: 'order',
                  icon: 'receipt-outline',
                  title: `Order ${order.orderNumber}`,
                  subtitle: orderSummary,
                  right: <MandiText variant="caption" color={Colors.textSecondary}>›</MandiText>,
                  onPress: () => router.push(`/restaurant/orders/${order.id}`),
                  accessibilityLabel: `Order ${order.orderNumber}, ${orderSummary}`,
                },
              ]}
            />
            {view.complete && <ReportIssueCard onReport={() => router.push(`/restaurant/dispute/${order.id}`)} />}
          </View>
        </ScrollView>
      </View>
    );
  }

  const partnerTravels = stagesFor(order.deliveryMode, delivery?.mode).length === 7;
  // Packing a pickup or the supplier's own run: there is no partner to promise.
  const pill = header.state === 'preparing' && !partnerTravels && !order.deliverySlotName ? null : header.pill;

  // The map's inputs. `pickup` only before pickup: after it the route runs from the truck to the drop.
  const beforePickup = header.map === 'pending' || header.state === 'assigned' || header.state === 'at_pickup';
  const pickup = beforePickup ? point(delivery?.pickupLocation) : null;
  const driver = header.map === 'pending' ? null : delivery?.location ?? null;
  const away = driver != null && drop != null ? haversineM(toLatLng(driver), drop) : null;
  const outletName = order.outletName ?? 'your outlet';
  const mapLabel = away != null
    ? `Map. Delivery partner ${distanceText(away)} away from ${outletName}`
    : 'Map of the route';
  const close = header.map === 'arriving' || header.map === 'reached';

  const partnerName = delivery?.driverName ?? null;
  const placeholder = header.partner === 'placeholder' ? placeholderCopy(header.state, supplier) : null;
  const itemCount = order.items.length;
  const summary = `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${formatMoney(order.totalAmount)}`;
  const deliveringTo = delivery?.dropAddress ?? [order.outletName, order.outletLocality].filter(Boolean).join(', ');
  const timeline = delivery?.timeline ?? [];

  const deliveryRows = (chatRow: DetailRow | null): DetailRow[] => [
    { key: 'drop', icon: 'location-outline', title: `Delivery at ${outletName}`, subtitle: deliveringTo || null },
    ...(chatRow ? [chatRow] : []),
  ];
  const canChat = order.outletId != null && order.supplierStoreId != null;

  return (
    <View style={styles.root}>
      <GreenTrackingHeader
        supplierLine={supplier}
        title={header.title}
        pill={pill}
        tone={header.tone}
        insetTop={insets.top}
        onBack={onBack}
        right={help}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      <ScrollView contentContainerStyle={styles.scroll} {...scrollProps}>
        {header.map !== 'none' && (
          <View testID="tracking-map">
            <MandiMap
              driver={driver}
              destination={drop}
              pickup={pickup}
              mode={header.map}
              stale={delivery?.locationStale === true}
              height={close ? TrackLayout.mapHeightClose : TrackLayout.mapHeight}
              accessibilityLabel={mapLabel}
              bare
            />
          </View>
        )}
        <View style={styles.cards}>
          {header.partner === 'card' && partnerName != null && (
            <DeliveryPartnerCard
              name={partnerName}
              phone={delivery?.driverPhone}
              showCall={view.showCall}
            />
          )}
          {placeholder != null && (
            <View>
              <DeliveryPartnerCard
                name={null}
                showCall={false}
                placeholder={{ title: placeholder.title, body: placeholder.body ?? '' }}
              />
              {header.progress === 'indeterminate' && (
                <View
                  style={styles.progressTrack}
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Finding a delivery partner"
                >
                  <View style={styles.progressFill} />
                </View>
              )}
            </View>
          )}
          {view.banner != null && <TrackingBanner banner={view.banner} />}
          {canChat ? (
            <MandiChatAction
              outletId={order.outletId}
              supplierStoreId={order.supplierStoreId}
              side="RESTAURANT"
              suggest={{ type: 'ORDER', id: order.id }}
            >
              {({ onPress, label }) => (
                <DetailRowCard
                  rows={deliveryRows({
                    key: 'supplier',
                    icon: 'chatbubble-outline',
                    title: supplier,
                    subtitle: 'Message about this order',
                    onPress,
                    accessibilityLabel: label,
                  })}
                />
              )}
            </MandiChatAction>
          ) : (
            <DetailRowCard rows={deliveryRows(null)} />
          )}
          <DetailRowCard
            rows={[{
              key: 'order',
              icon: 'receipt-outline',
              title: `Order ${order.orderNumber}`,
              subtitle: summary,
              right: <MandiText variant="caption" color={Colors.textSecondary}>›</MandiText>,
              onPress: () => router.push(`/restaurant/orders/${order.id}`),
              accessibilityLabel: `Order ${order.orderNumber}, ${summary}`,
            }]}
          />
          {timeline.length > 0 && (
            <CollapsibleSection
              title="Activity"
              summary={`${timeline.length} ${timeline.length === 1 ? 'update' : 'updates'}`}
            >
              <DeliveryTimeline events={timeline} />
            </CollapsibleSection>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  grow: { flexGrow: 1 },
  scroll: { flexGrow: 1, paddingBottom: Spacing.xl },
  cards: { gap: Spacing.md, paddingHorizontal: Spacing.screenHorizontal, paddingTop: Spacing.md },
  progressTrack: {
    height: SEARCH_BAR_HEIGHT,
    borderRadius: Radius.sm / 2,
    backgroundColor: Colors.progressTrack,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  progressFill: { width: SEARCH_BAR_FILL, height: '100%', backgroundColor: Colors.primary },
});
