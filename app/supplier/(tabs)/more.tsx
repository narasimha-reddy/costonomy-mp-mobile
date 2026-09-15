import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  MandiButton,
  MandiCard,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiText,
} from '@/components/common';
import { Colors, Spacing } from '@/theme';

/** Account, stores, and the screens that have not landed yet. */
export default function SupplierMoreScreen() {
  const router = useRouter();
  const { me, signOut } = useSession();
  const { stores } = useStore();

  return (
    <MandiScreen header={<MandiHeader title="More" />}>
      <MandiCard>
        <MandiText variant="caption" color={Colors.textSecondary}>Signed in as</MandiText>
        <MandiText variant="subtitle">{me?.user.name ?? me?.user.phone}</MandiText>
      </MandiCard>

      <View style={styles.section}>
        <MandiSectionHeader title="Stores" subtitle={`${stores.length} on this account`} />
        {stores.map((store) => (
          <MandiCard key={store.id}>
            <MandiText variant="bodyEmphasis">{store.name}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {[store.addressLine1, store.city, store.pincode].filter(Boolean).join(', ')}
            </MandiText>
            {store.responseSlaSeconds != null && (
              <MandiText variant="caption" color={Colors.textTertiary}>
                {Math.round(store.responseSlaSeconds / 60)} min to answer an order ·{' '}
                {store.preparationMinutes ?? '—'} min to prepare
              </MandiText>
            )}
          </MandiCard>
        ))}
      </View>

      <MandiCard onPress={() => router.push('/supplier/settlements')}>
        <MandiText variant="bodyEmphasis">Settlements</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          What you have been paid, and the commission on each order
        </MandiText>
      </MandiCard>

      <MandiButton label="Sign out" onPress={signOut} variant="secondary" />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
});
