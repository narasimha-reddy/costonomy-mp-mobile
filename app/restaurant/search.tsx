import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { searchProducts } from '@/services/catalog';
import { useDebounced } from '@/hooks/useDebounced';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { ProductCard } from '@/components/product/ProductCard';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { Colors, Spacing, TouchTarget } from '@/theme';

const MIN_TERM = 2;

/**
 * REST-SEARCH-02. Doc 05 §6.
 *
 * <p>The field updates on every keystroke; the request waits for a pause. A
 * request per character would be both slower and, on the search rate limit, a
 * way to throttle a user for typing.
 */
export default function SearchScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const [term, setTerm] = useState('');
  const { recent, remember, clear } = useRecentSearches();

  const settled = useDebounced(term, 250);
  const active = settled.trim().length >= MIN_TERM;

  const query = useQuery({
    queryKey: ['search', 'products', settled.trim()],
    queryFn: ({ signal }) => searchProducts(accessToken as string, settled.trim(), signal),
    enabled: active && accessToken != null,
  });

  function open(productId: number) {
    remember(settled.trim());
    router.push(`/restaurant/product/${productId}`);
  }

  return (
    <MandiScreen header={<Header term={term} onTerm={setTerm} loading={query.isFetching} />}>
      {!active ? (
        <RecentSearches recent={recent} onPick={setTerm} onClear={clear} />
      ) : query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error ? (
        <MandiErrorState message="Search didn't work." onRetry={() => query.refetch()} />
      ) : (query.data ?? []).length === 0 ? (
        <MandiEmptyState
          icon="search-outline"
          title={`Nothing for "${settled.trim()}"`}
          description="Try a shorter word, or the name your supplier uses."
        />
      ) : (
        (query.data ?? []).map((product) => (
          <ProductCard key={product.id} product={product} onPress={() => open(product.id)} />
        ))
      )}
    </MandiScreen>
  );
}

function RecentSearches({
  recent,
  onPick,
  onClear,
}: {
  recent: string[];
  onPick: (term: string) => void;
  onClear: () => void;
}) {
  if (recent.length === 0) {
    return (
      <MandiEmptyState
        icon="search-outline"
        title="What do you need?"
        description="Search the catalog and compare every supplier stocking it."
      />
    );
  }

  return (
    <View style={styles.section}>
      <MandiSectionHeader title="Recent" actionLabel="Clear" onAction={onClear} />
      {recent.map((item) => (
        <Pressable
          key={item}
          onPress={() => onPick(item)}
          accessibilityRole="button"
          style={styles.recentRow}
        >
          <Ionicons name="time-outline" size={16} color={Colors.textTertiary} />
          <MandiText variant="body">{item}</MandiText>
        </Pressable>
      ))}
    </View>
  );
}

function Header({
  term,
  onTerm,
  loading,
}: {
  term: string;
  onTerm: (term: string) => void;
  loading: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
      >
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <MandiSearchBar
        value={term}
        onChangeText={onTerm}
        placeholder="Search paneer, rice, oil…"
        autoFocus
        loading={loading}
        style={styles.field}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
  },
  back: { width: TouchTarget.min, height: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1 },
  section: { gap: Spacing.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TouchTarget.min },
});
