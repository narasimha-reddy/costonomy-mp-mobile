import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlets } from '@/lib/outlets';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiSectionHeader,
  MandiText,
} from '@/components/common';
import { Colors, Spacing } from '@/theme';

/**
 * REST-HOME-01 — placeholder.
 *
 * <p>§23A.9's real information hierarchy — requirements, live orders, awaiting
 * acceptance, recommended procurement — arrives in M2. What this proves today is
 * the thing M1 exists for: a real session, the server's own membership answer,
 * and a signed-in user who landed in the right half of the app.
 *
 * <p>The outlet list comes from {@link useOutlets}, not from the memberships
 * directly — an owner holds one restaurant-scope grant and no outlet rows, and
 * the outlets are still theirs.
 */
export default function RestaurantHome() {
  const { me, signOut } = useSession();
  const { outlets, loading, error } = useOutlets();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <MandiText variant="caption" color={Colors.textSecondary}>Signed in as</MandiText>
        <MandiText variant="title">{me?.user.name ?? me?.user.phone}</MandiText>
      </View>

      <MandiSectionHeader title="Your outlets" />
      {renderOutlets()}

      <MandiButton label="Sign out" onPress={signOut} variant="secondary" />
    </ScrollView>
  );

  function renderOutlets() {
    if (loading) {
      return (
        <MandiCard>
          <MandiText variant="body" color={Colors.textSecondary}>Loading outlets…</MandiText>
        </MandiCard>
      );
    }

    if (error) {
      return (
        <MandiEmptyState
          title="Couldn't load your outlets"
          description="Check your connection and pull to try again."
        />
      );
    }

    if (outlets.length === 0) {
      return (
        <MandiEmptyState
          title="No outlets yet"
          description="Add your first outlet to start ordering."
        />
      );
    }

    return outlets.map((outlet) => (
      <MandiCard key={outlet.id}>
        <MandiText variant="bodyEmphasis">{outlet.name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {[outlet.addressLine1, outlet.city].filter(Boolean).join(', ')}
        </MandiText>
      </MandiCard>
    ));
  }
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.lg },
  header: { gap: Spacing.xs },
});
