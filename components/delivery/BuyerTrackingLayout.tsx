import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { supplierTrackingHeader } from '@/lib/delivery/supplierTrackingHeader';
import type { Delivery } from '@/models/delivery';
import type { SupplierOrder } from '@/models/procurement';
import { fetchRating } from '@/services/trust';
import { paymentLine } from '@/lib/payments/paymentLine';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TrackLayout } from '@/theme';

function point(loc: { latitude: string | number; longitude: string | number } | null | undefined): LatLng | null {
  if (loc == null) return null;
  const latitude = Number(loc.latitude);
  const longitude = Number(loc.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

/** The line under "Order placed", by what the supplier has actually done: it is no longer waiting once confirmed. */
function placedCaption(status: string, supplierName: string): string | undefined {
  if (status === 'CONFIRMED') return `${supplierName} will start packing soon`;
  if (status === 'PREPARING') return 'Packing your order';
  return undefined;
}

/** "On credit, due 7 Nov" or "Paid" from the server's payment fields; null when the line would only say "Total". */
function placedPaymentText(order: SupplierOrder): string | null {
  const line = paymentLine(order);
  return line.label === 'Total' ? null : line.label;
}

const SEARCH_BAR_HEIGHT = 5;
/** How much of the indeterminate bar is drawn; static, so reduced motion needs nothing special. */
const SEARCH_BAR_FILL = '35%';

/** "850 m" under a kilometre, else "2.4 km". Display only: the arithmetic is the haversine in mapGeometry. */
function distanceText(metres: number): string {
  return metres < 1000 ? `${Math.max(1, Math.round(metres))} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * The live tracking screen (restyle spec 4.A): the green header, the map, then the cards. The restaurant and the
 * supplier see the same layout; `audience` picks the header logic (`buyerTrackingHeader` or `supplierTrackingHeader`),
 * the copy, the chat side and where the order row leads. The supplier's own controls (sandbox card, partner search and
 * retry panel) arrive as `extras` and sit under the partner area.
 *
 * <p>Every decision about what to show comes from the header function; this component only lays it out and wires
 * the taps. Delivered and completed draw the receipt (restyle spec 4.B) instead of the map. Where the placeholder would read as a promise that cannot be kept (a pickup
 * or the supplier's own delivery has no partner to assign) the "we'll assign a partner soon" pill is left out.
 */
export function BuyerTrackingLayout({
  order, delivery, view, nowMs, outlet, onRefresh, refreshing, onBack, help, audience = 'buyer', extras,
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
  audience?: 'buyer' | 'supplier';
  /** Supplier-only cards and controls, drawn under the partner area. */
  extras?: React.ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useSession();

  // The drop: the server's own coordinates when it sends them (API B1), else the outlet the app already knows.
  const drop: LatLng | null = point(delivery?.dropLocation) ?? outlet;
  const buyer = audience === 'buyer';
  const header = buyer
    ? buyerTrackingHeader({ view, order, delivery, drop, nowMs })
    : supplierTrackingHeader({ view, order, delivery, drop, nowMs });
  // The line under the back button: the supplier for the restaurant, the restaurant for the supplier.
  const supplier = header.supplierLine;
  const chatSide = buyer ? 'RESTAURANT' as const : 'SUPPLIER' as const;
  const orderRoute = buyer ? `/restaurant/orders/${order.id}` : `/supplier/orders/${order.id}`;
  // Only a COMPLETED order can be rated (the API refuses otherwise). A GET: the row shows on a 404, "not rated yet".
  const receipt = header.layout === 'receipt';
  const rating = useQuery({
    queryKey: ['supplier-order', order.id, 'rating'],
    queryFn: () => fetchRating(accessToken as string, order.id),
    enabled: buyer && receipt && order.status === 'COMPLETED' && accessToken != null,
    retry: (count, error) => !isApiError(error) && count < 2,
  });
  const unrated = rating.data == null && rating.isError && isApiError(rating.error) && rating.error.status === 404;
  const scrollProps = {
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />,
  };

  if (header.layout === 'placed') {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top, backgroundColor: Colors.surface }}>
          {/* A white bar: the clock and icons must be dark, or they vanish into it. */}
          <StatusBar style="dark" />
          <MandiHeader title={supplier} subtitle={order.orderNumber} back onBack={onBack} right={help} />
        </View>
        <ScrollView contentContainerStyle={styles.grow} {...scrollProps}>
          <OrderPlacedHero
            placedAt={order.createdAt ?? null}
            supplier={buyer ? supplier : order.supplierName ?? order.storeName ?? supplier}
            caption={buyer ? placedCaption(order.status, order.supplierName ?? supplier) : 'Ready for you to start preparing'}
            total={buyer ? formatMoney(order.totalAmount) : undefined}
            paymentText={buyer ? placedPaymentText(order) : undefined}
            onViewOrder={buyer ? () => router.push(orderRoute) : undefined}
            onHome={buyer ? () => router.navigate('/restaurant/(tabs)') : undefined}
            outletName={order.outletName ?? (buyer ? 'Your outlet' : 'The restaurant')}
            address={delivery?.dropAddress ?? ([order.outletName, order.outletLocality].filter(Boolean).join(', ') || null)}
            segments={view.segments}
            segmentIndex={view.segmentIndex}
          />
        </ScrollView>
      </View>
    );
  }

  if (receipt) {
    const outletLabel = order.outletName ?? (buyer ? 'your outlet' : 'the restaurant');
    const address = delivery?.dropAddress ?? ([order.outletName, order.outletLocality].filter(Boolean).join(', ') || null);
    const at = clockTime(delivery?.deliveredAt);
    const orderSummary = `${order.items.length} ${order.items.length === 1 ? 'item' : 'items'} · ${formatMoney(order.totalAmount)}`;
    const canChatHere = order.outletId != null && order.supplierStoreId != null;
    const rateRow: DetailRow[] = !buyer ? (order.status === 'DELIVERED' ? [{
      key: 'checkin',
      icon: 'time-outline',
      title: 'Waiting for the restaurant to check it in',
    }] : []) : unrated ? [{
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
      ...(chatRow ? [chatRow] : [{
        key: 'supplier', icon: 'storefront-outline' as const, title: buyer ? order.storeName ?? supplier : supplier,
      }]),
      ...rateRow,
    ];
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top, backgroundColor: Colors.surface }}>
          <StatusBar style="dark" />
          <MandiHeader title={supplier} back onBack={onBack} right={help} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} {...scrollProps}>
          <ReceiptHero title={`Order delivered at ${outletLabel}`} subtitle={at != null ? `Delivered at ${at}` : null} />
          <View style={styles.cards}>
            {canChatHere ? (
              <MandiChatAction
                outletId={order.outletId}
                supplierStoreId={order.supplierStoreId}
                side={chatSide}
                suggest={{ type: 'ORDER', id: order.id }}
              >
                {({ onPress, label }) => (
                  <DetailRowCard
                    rows={supplierRows({
                      key: 'supplier',
                      icon: 'chatbubble-outline',
                      title: buyer ? order.storeName ?? supplier : supplier,
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
              <DeliveryPartnerCard
                name={delivery.driverName}
                vehicle={buyer ? undefined : delivery.driverVehicle}
                showCall={false}
                delivered
              />
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
                  onPress: () => router.push(orderRoute as never),
                  accessibilityLabel: `Order ${order.orderNumber}, ${orderSummary}`,
                },
              ]}
            />
            {buyer && view.complete && <ReportIssueCard onReport={() => router.push(`/restaurant/dispute/${order.id}`)} />}
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
  const outletName = order.outletName ?? (buyer ? 'your outlet' : 'the restaurant');
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
    {
      key: 'drop',
      icon: 'location-outline',
      title: buyer ? `Delivery at ${outletName}` : `Deliver to ${outletName}`,
      subtitle: deliveringTo || null,
    },
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
              vehicle={buyer ? undefined : delivery?.driverVehicle}
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
          {extras}
          {canChat ? (
            <MandiChatAction
              outletId={order.outletId}
              supplierStoreId={order.supplierStoreId}
              side={chatSide}
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
              onPress: () => router.push(orderRoute as never),
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
