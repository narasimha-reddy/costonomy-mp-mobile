import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import {
  MandiButton,
  MandiCard,
  MandiScreen,
  MandiSectionHeader,
  MandiText,
} from '@/components/common';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { Colors, Spacing } from '@/theme';

/** REST-ACCOUNT-01. Doc 05 §4. */
export default function AccountScreen() {
  const router = useRouter();
  const { me, signOut } = useSession();
  const { outlets } = useOutlet();

  return (
    <MandiScreen header={<RestaurantHeader screen="REST-ACCOUNT-01" subtitle="Account" />}>
      <MandiCard>
        <MandiText variant="caption" color={Colors.textSecondary}>Signed in as</MandiText>
        <MandiText variant="subtitle">{me?.user.name ?? me?.user.phone}</MandiText>
        {me?.user.name && (
          <MandiText variant="caption" color={Colors.textSecondary}>{me.user.phone}</MandiText>
        )}
      </MandiCard>

      <MandiCard onPress={() => router.push('/restaurant/credit')}>
        <MandiText variant="bodyEmphasis">Credit</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          What each supplier has extended, and what you owe
        </MandiText>
      </MandiCard>

      <View style={styles.section}>
        <MandiSectionHeader title="Outlets" subtitle={`${outlets.length} on this account`} />
        {outlets.map((outlet) => (
          <MandiCard key={outlet.id}>
            <MandiText variant="bodyEmphasis">{outlet.name}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {[outlet.addressLine1, outlet.city, outlet.pincode].filter(Boolean).join(', ')}
            </MandiText>
          </MandiCard>
        ))}
      </View>

      <View style={styles.section}>
        <MandiSectionHeader title="Roles" />
        {(me?.memberships ?? []).map((membership) => (
          <MandiCard key={`${membership.scopeType}-${membership.scopeId}`}>
            <MandiText variant="bodyEmphasis">{membership.scopeName}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {membership.roles.join(', ').replace(/_/g, ' ').toLowerCase()}
            </MandiText>
          </MandiCard>
        ))}
      </View>

      <MandiButton label="Sign out" onPress={signOut} variant="secondary" />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
});
