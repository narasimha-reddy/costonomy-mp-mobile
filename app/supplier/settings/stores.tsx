import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStore, type SupplierStore } from '@/services/supplier';
import {
  MandiCard,
  MandiHeader,
  MandiScreen,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { Colors, Spacing } from '@/theme';

/**
 * The stores you ship from.
 *
 * <p><b>A list, not a form.</b> Everything a store holds — address, coordinates,
 * trading hours, delivery terms, credit terms — used to be one expanding card, and
 * a supplier scanning for "which store is offline" had to read a form to find out.
 * Each store is now a summary that opens its own screen.
 */
export default function StoreSettingsScreen() {
  const { stores } = useStore();
  const router = useRouter();

  return (
    <MandiScreen header={<MandiHeader title="Stores" back />}>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Delivery is quoted by distance from a store, so where each one sits decides which
        restaurants can buy from it.
      </MandiText>

      {stores.map((store) => (
        <StoreRow
          key={store.id}
          store={store}
          onOpen={() => router.push(`/supplier/settings/store/${store.id}`)}
        />
      ))}
    </MandiScreen>
  );
}

function StoreRow({ store, onOpen }: { store: SupplierStore; onOpen: () => void }) {
  const { accessToken } = useSession();

  // The list in context carries what registration returned; hours and the full
  // address arrive from the store's own endpoint.
  const detail = useQuery({
    queryKey: ['supplier-store', store.id],
    queryFn: () => fetchStore(accessToken as string, store.id),
    enabled: accessToken != null,
  });

  const current = detail.data ?? store;
  const online = current.status === 'ACTIVE';
  const located = current.latitude != null && current.longitude != null;
  const hours = current.operatingHours;

  return (
    <MandiCard onPress={onOpen}>
      {/* Only the name shares the row with the chip and the chevron. Wrapping
          all three lines beside them narrowed every one by their combined width,
          and the address lost its PIN code — the part that identifies which
          branch this is. */}
      <View style={styles.titleRow}>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
          {current.name}
        </MandiText>
        <MandiStatusChip
          label={online ? 'Open' : 'Offline'}
          tone={online ? 'success' : 'neutral'}
          size="sm"
        />
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </View>

      <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
        {[current.addressLine1, current.city, current.pincode].filter(Boolean).join(', ')
          || 'No address yet'}
      </MandiText>
      {/* Hours on their own line rather than as a fact tile with a caption under
          it. "Every day · 10:00–21:00" is one statement, and splitting it across
          a label and a hint made two small things out of one. */}
      <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
        {hours ? `${dayLabel(hours.days)} · ${hours.opensAt}–${hours.closesAt}` : 'Hours not set'}
      </MandiText>

      {/* Only when something is wrong. "Located · Quotable" on every row was a
          badge that said nothing — it is true of every store that works — while
          the case worth a whole line is the store no restaurant can find. */}
      {!located ? (
        <View style={styles.warning}>
          <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
          <MandiText variant="caption" color={Colors.warning} style={styles.flex}>
            No location pin. Delivery is quoted by distance, so restaurants cannot see this store.
          </MandiText>
        </View>
      ) : null}
    </MandiCard>
  );
}

const ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * "Every day", "Mon–Sat" where the days run together, else the days themselves.
 *
 * <p>A count — "6 days a week" — is the one answer that makes a supplier open the
 * screen to find out *which* six.
 */
function dayLabel(days: string[]): string {
  const indexes = days
    .map((day) => ORDER.indexOf(day))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  if (indexes.length === 0) return 'No days set';
  if (indexes.length === 7) return 'Every day';

  const contiguous = indexes.every((index, i) => i === 0 || index === indexes[i - 1]! + 1);
  if (contiguous && indexes.length > 2) {
    return `${SHORT[indexes[0]!]}–${SHORT[indexes[indexes.length - 1]!]}`;
  }
  return indexes.map((index) => SHORT[index]).join(', ');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
});
