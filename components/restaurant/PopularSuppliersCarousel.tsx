import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchPopularSuppliers } from '@/services/catalog';
import {
  MandiSectionHeader,
  MandiSkeletonList,
} from '@/components/common';
import { SupplierTile } from '@/components/restaurant/SupplierTile';
import { useOutletCredit } from '@/hooks/useOutletCredit';
import { Spacing } from '@/theme';

/**
 * Suppliers worth a look, as a rail of cards.
 *
 * <p><b>Each tile leads with what they sell.</b> A name and a distance do not
 * answer the only question a kitchen has here — is it worth opening this one —
 * and "Dairy · Vegetables · Staples" does. The categories come from the
 * supplier's live catalogue rather than anything they wrote about themselves,
 * so a store calling itself "general provisions" and listing only dairy reads
 * as dairy.
 *
 * <p><b>A rail rather than a list</b>, which is the opposite of the call made
 * for the supplier's own requests. That one had a clock on it and somebody
 * waiting; this is browsing, and browsing is what sideways scrolling is for —
 * it costs no vertical space on a screen whose real work sits below it.
 *
 * <p>Renders nothing when there are none. An empty state here would push
 * requests and orders down the screen to say "no suppliers", which is a
 * statement about the platform rather than about this kitchen.
 */
export function PopularSuppliersCarousel({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();
  const { creditFor } = useOutletCredit();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'popular-suppliers'],
    queryFn: () => fetchPopularSuppliers(accessToken as string, outletId as number, 10),
    enabled: outletId != null && accessToken != null,
    // A supplier's catalogue does not change while somebody reads a home screen.
    staleTime: 5 * 60_000,
  });

  const suppliers = query.data ?? [];

  if (query.isPending) {
    return (
      <View style={styles.section}>
        <MandiSectionHeader title="Popular Suppliers" />
        <MandiSkeletonList count={1} />
      </View>
    );
  }

  if (query.error != null || suppliers.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Popular Suppliers"
        count={suppliers.length}
        subtitle="Browse a shelf and add straight to your cart"
        actionLabel="See all"
        onAction={() => router.push('/restaurant/suppliers')}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rail}
        contentContainerStyle={styles.railContent}
      >
        {suppliers.map((supplier) => (
          <SupplierTile
            key={supplier.supplierStoreId}
            supplier={supplier}
            credit={creditFor(supplier.supplierStoreId)}
            onPress={() => router.push(`/restaurant/supplier/${supplier.supplierStoreId}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}



const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  // flexGrow 0, or a rail nested in a scrolling screen expands to fill it and
  // the tiles float in the middle of a tall empty box.
  rail: { flexGrow: 0, flexShrink: 0 },
  railContent: { gap: Spacing.sm, paddingHorizontal: Spacing.screenHorizontal },
});
