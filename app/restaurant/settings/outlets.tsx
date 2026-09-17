import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import type { Outlet } from '@/services/restaurant';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFab,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { Colors, Spacing } from '@/theme';

/**
 * Every outlet on this account.
 *
 * <p>The list a restaurant manages from, and deliberately the same card the
 * supplier's store list uses: a heading with the status beside it, the address
 * beneath, and what is missing said out loud. An outlet with no pin cannot be
 * quoted for delivery, and a list that showed it as ordinary would leave someone
 * wondering why nothing reaches them.
 *
 * <p>Adding an outlet needs `RESTAURANT_EDIT` — it is a change to the restaurant,
 * not to any outlet — so a manager assigned to one branch sees the list without
 * the button.
 */
export default function OutletsScreen() {
  const router = useRouter();
  const { outlets, outlet, loading, error } = useOutlet();
  const { canForRestaurant, canForOutlet } = usePermissions();

  const restaurantId = outlet?.restaurantId ?? null;
  const canAdd = canForRestaurant('RESTAURANT_EDIT', restaurantId);

  return (
    <MandiScreen
      header={<MandiHeader title="Outlets" back />}
      floating={
        canAdd ? (
          <MandiFab
            accessibilityLabel="Add an outlet"
            onPress={() => router.push('/restaurant/settings/outlet/new')}
          />
        ) : undefined
      }
    >
      {loading ? (
        <MandiSkeletonList count={3} />
      ) : error ? (
        <MandiErrorState message="Couldn't load your outlets." />
      ) : outlets.length === 0 ? (
        <MandiEmptyState
          icon="location-outline"
          title="No outlets yet"
          description="An outlet is a kitchen you order for. Add the first one to start."
        />
      ) : (
        outlets.map((item) => (
          <OutletCard
            key={item.id}
            outlet={item}
            editable={canForOutlet('OUTLET_EDIT', item)}
            onPress={() => router.push(`/restaurant/settings/outlet/${item.id}`)}
          />
        ))
      )}
    </MandiScreen>
  );
}

function OutletCard({
  outlet,
  editable,
  onPress,
}: {
  outlet: Outlet;
  editable: boolean;
  onPress: () => void;
}) {
  const address = [outlet.addressLine1, outlet.city, outlet.pincode].filter(Boolean).join(', ');
  const pinned = outlet.latitude != null && outlet.longitude != null;
  const active = outlet.status === 'ACTIVE';

  return (
    <MandiCard onPress={onPress}>
      {/* Only the title shares a row with the chip. Anything else on this line
          and the address below it wraps early against an invisible edge. */}
      <View style={styles.titleRow}>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
          {outlet.name}
        </MandiText>
        {!active && <MandiStatusChip label="Closed" tone="neutral" size="sm" />}
      </View>

      {address !== '' && (
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>
          {address}
        </MandiText>
      )}

      <View style={styles.facts}>
        {/* Absent is a fact, and this one costs orders (doc 07 §13). */}
        {pinned ? (
          <Fact icon="location" tone={Colors.success} text="Pinned on the map" />
        ) : (
          <Fact icon="location-outline" tone={Colors.warning} text="Not pinned — can't be quoted" />
        )}
        {outlet.contactPhone != null && (
          <Fact icon="call-outline" tone={Colors.textTertiary} text={outlet.contactPhone} />
        )}
      </View>

      <MandiText variant="caption" color={Colors.textTertiary}>
        {editable ? 'Tap to edit' : 'Tap to view'}
      </MandiText>
    </MandiCard>
  );
}

function Fact({
  icon,
  tone,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  text: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={13} color={tone} />
      <MandiText variant="caption" color={Colors.textSecondary}>{text}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});
