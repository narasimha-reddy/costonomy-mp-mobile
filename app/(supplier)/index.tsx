import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSession } from '@/contexts/SessionProvider';
import { storeGrantsOf } from '@/lib/session/types';
import { MandiButton, MandiCard, MandiSectionHeader, MandiText } from '@/components/common';
import { Colors, Spacing } from '@/theme';

/**
 * SUP-HOME-01 — placeholder.
 *
 * <p>§23A.33's hierarchy — new orders first, then the response countdown — is M4.
 * The countdown matters more here than anywhere else in the app: a supplier who
 * misses it loses the order to a timeout, so this screen gets built against a
 * real order rather than mocked.
 */
export default function SupplierHome() {
  const { me, signOut } = useSession();
  const stores = me ? storeGrantsOf(me.memberships) : [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <MandiText variant="caption" color={Colors.textSecondary}>Signed in as</MandiText>
        <MandiText variant="title">{me?.user.name ?? me?.user.phone}</MandiText>
      </View>

      <MandiSectionHeader title="Your stores" />
      {stores.map((store) => (
        <MandiCard key={`${store.scopeType}-${store.scopeId}`}>
          <MandiText variant="bodyEmphasis">{store.scopeName}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {store.parentScopeName} · {store.roles.join(', ')}
          </MandiText>
        </MandiCard>
      ))}

      <MandiButton label="Sign out" onPress={signOut} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.lg },
  header: { gap: Spacing.xs },
});
