import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useDebounced } from '@/hooks/useDebounced';
import { fetchProducts } from '@/services/catalog';
import { createRequirement } from '@/services/procurement';
import type { Product } from '@/models/catalog';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiFormField,
  MandiHeader,
  MandiQuantityStepper,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-REQ-01';
const CATALOG_PAGE = 100;

/**
 * Raise a requirement — what this kitchen still needs.
 *
 * <p>A requirement is not an order. It is the need itself, which is why it
 * outlives a supplier declining: guardrail 14 keeps the unmet quantity on it
 * through rejection, timeout and partial acceptance, so a restaurant never
 * retypes what it already asked for. Without one, a shortfall has nowhere to go
 * and re-sourcing means rebuilding the whole list by hand.
 *
 * <p><b>Quantities are in the product's own unit, not in packs.</b> A requirement
 * says "40 kg of paneer" because that is what the kitchen needs; how many packs
 * that turns out to be depends on which supplier fills it, and is decided later.
 * It is the one place in this app where a quantity is not a pack count.
 *
 * <p>No unit picker: every canonical product carries its base unit, and offering
 * a choice would invite a requirement in litres against a product sold by weight.
 */
export default function NewRequirementScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');

  const settled = useDebounced(term, 250);

  const products = useQuery({
    queryKey: ['products', 'all', outletId],
    queryFn: () => fetchProducts(accessToken as string, { size: CATALOG_PAGE, outletId }),
    enabled: accessToken != null,
    staleTime: 5 * 60 * 1000,
  });

  const all = useMemo(() => products.data ?? [], [products.data]);

  const matching = useMemo(() => {
    const needle = settled.trim().toLowerCase();
    if (!needle) return [];
    return all.filter((product) =>
      `${product.name} ${product.categoryName ?? ''} ${product.aliases.join(' ')}`
        .toLowerCase()
        .includes(needle));
  }, [all, settled]);

  const picked = useMemo(
    () => all.filter((product) => chosen[product.id] != null),
    [all, chosen],
  );

  const create = useMutation({
    mutationFn: () =>
      createRequirement(accessToken as string, outletId as number, {
        items: picked.map((product) => ({
          canonicalProductId: product.id,
          quantity: String(chosen[product.id]),
          unit: product.baseUnit,
        })),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (requirement) => {
      track('requirement_created', { screen: SCREEN, outletId, entityId: requirement.id });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'requirements'] });
      toast.show('Requirement raised', 'success');
      router.replace(`/restaurant/requirements/${requirement.id}`);
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not raise that.', 'error'),
  });

  function toggle(product: Product) {
    setChosen((current) => {
      const next = { ...current };
      if (next[product.id] != null) delete next[product.id];
      else next[product.id] = 1;
      return next;
    });
  }

  return (
    <MandiScreen
      header={<MandiHeader title="What do you need?" back />}
      footer={
        picked.length > 0 ? (
          <MandiStickyBar>
            <MandiButton
              label={`Raise for ${picked.length} product${picked.length === 1 ? '' : 's'}`}
              size="lg"
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          </MandiStickyBar>
        ) : undefined
      }
    >
      {picked.length > 0 && (
        <View style={styles.section}>
          <MandiSectionHeader title="Needed" count={picked.length} />
          {picked.map((product) => (
            <MandiCard key={product.id}>
              <View style={styles.row}>
                <ProductThumb uri={product.imageUrl} size={40} />
                <View style={styles.text}>
                  <MandiText variant="bodyEmphasis" numberOfLines={1}>{product.name}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {product.categoryName}
                  </MandiText>
                </View>
                <Pressable
                  onPress={() => toggle(product)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${product.name}`}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={Colors.textTertiary} />
                </Pressable>
              </View>
              {/* The product's own unit, because that is what the kitchen
                  measures in. Packs are a supplier's business. */}
              <MandiQuantityStepper
                value={chosen[product.id] ?? 1}
                onChange={(quantity) =>
                  setChosen((current) => ({ ...current, [product.id]: quantity }))}
                min={1}
                unit={product.baseUnit}
                itemLabel={product.name}
              />
            </MandiCard>
          ))}

          <MandiCard>
            <MandiFormField
              label="Note (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Anything about when or why you need this"
            />
          </MandiCard>
        </View>
      )}

      <View style={styles.section}>
        <MandiSectionHeader title={picked.length > 0 ? 'Add more' : 'Search the catalog'} />
        <MandiSearchBar
          value={term}
          onChangeText={setTerm}
          placeholder="Search paneer, rice, oil…"
          autoFocus={picked.length === 0}
          loading={products.isFetching}
        />

        {products.isPending ? (
          <MandiSkeletonList count={4} />
        ) : settled.trim() === '' ? (
          <MandiText variant="caption" color={Colors.textTertiary} style={styles.hint}>
            Search for what you need. A requirement holds the need itself, so anything a
            supplier cannot fill stays on it and can be sourced from someone else.
          </MandiText>
        ) : matching.length === 0 ? (
          <MandiEmptyState
            icon="search-outline"
            title={`Nothing for "${settled.trim()}"`}
            description="Try a shorter word, or the name your supplier uses."
          />
        ) : (
          <View>
            {matching.map((product) => {
              const added = chosen[product.id] != null;
              return (
                <Pressable
                  key={product.id}
                  onPress={() => toggle(product)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: added }}
                  accessibilityLabel={`${added ? 'Remove' : 'Add'} ${product.name}`}
                  style={styles.result}
                >
                  <ProductThumb uri={product.imageUrl} size={40} />
                  <View style={styles.text}>
                    <MandiText variant="body" numberOfLines={1}>{product.name}</MandiText>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {[product.categoryName, `per ${product.baseUnit}`].filter(Boolean).join(' · ')}
                    </MandiText>
                  </View>
                  <Ionicons
                    name={added ? 'checkmark-circle' : 'add-circle-outline'}
                    size={22}
                    color={added ? Colors.primary : Colors.textTertiary}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  text: { flex: 1, gap: 2 },
  hint: { paddingHorizontal: Spacing.xs },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    borderRadius: Radius.sm,
  },
});
