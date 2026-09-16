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
      <View style={styles.row}>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis" numberOfLines={1}>{current.name}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {[current.addressLine1, current.city, current.pincode].filter(Boolean).join(', ')
              || 'No address yet'}
          </MandiText>
        </View>
        <MandiStatusChip
          label={online ? 'Open' : 'Offline'}
          tone={online ? 'success' : 'neutral'}
          size="sm"
        />
      </View>

      <View style={styles.facts}>
        <Fact
          icon="time-outline"
          label={hours ? `${hours.opensAt}–${hours.closesAt}` : '—'}
          hint={hours ? dayLabel(hours.days) : 'Hours not set'}
        />
        <Fact
          icon={located ? 'location' : 'location-outline'}
          label={located ? 'Located' : 'No pin'}
          hint={located ? 'Quotable' : 'Set the pin'}
          tone={located ? undefined : Colors.warning}
        />
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </View>
    </MandiCard>
  );
}

function Fact({
  icon,
  label,
  hint,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  tone?: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={tone ?? Colors.textTertiary} />
      <View>
        <MandiText variant="captionEmphasis" color={tone ?? Colors.textPrimary}>{label}</MandiText>
        <MandiText variant="caption" color={Colors.textTertiary}>{hint}</MandiText>
      </View>
    </View>
  );
}

/** "Every day", "Mon–Fri" where contiguous, else a count. */
function dayLabel(days: string[]): string {
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'No days set';
  return `${days.length} days a week`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  facts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});
