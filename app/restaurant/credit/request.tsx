import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { searchSuppliers } from '@/services/catalog';
import { requestCredit } from '@/services/credit';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-CREDIT-02';

const PERIODS = [7, 15, 30, 45];

/**
 * REST-CREDIT-02. Doc 05 §20.
 *
 * <p>Supplier, outlet, requested limit, payment days, purpose — the spec's
 * fields. The outlet is the one currently selected rather than a picker: credit
 * belongs to an outlet, and choosing a different one here than the header shows
 * is how a restaurant ends up with a line against the wrong branch.
 */
export default function CreditRequestScreen() {
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();
  const { outletId, outlet } = useOutlet();

  const [storeId, setStoreId] = useState<number | null>(null);
  const [limit, setLimit] = useState('');
  const [days, setDays] = useState(30);
  const [purpose, setPurpose] = useState('');

  const suppliers = useQuery({
    queryKey: ['outlet', outletId, 'suppliers'],
    queryFn: () => searchSuppliers(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const submit = useMutation({
    mutationFn: () =>
      requestCredit(accessToken as string, {
        supplierStoreId: storeId as number,
        outletId: outletId as number,
        requestedLimit: limit,
        requestedDays: days,
        purpose: purpose || undefined,
      }),
    onSuccess: () => {
      track('credit_requested', { screen: SCREEN, outletId }, { days });
      toast.show('Request sent to the supplier', 'success');
      router.replace('/restaurant/credit');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error'),
  });

  const amount = Number(limit);
  const valid = storeId != null && Number.isFinite(amount) && amount > 0;

  return (
    <MandiScreen
      header={<MandiHeader title="Request credit" subtitle={outlet?.name} back />}
      footer={
        <MandiStickyBar>
          <MandiButton
            label="Send request"
            size="lg"
            disabled={!valid}
            loading={submit.isPending}
            onPress={() => submit.mutate()}
          />
          <MandiText variant="caption" color={Colors.textTertiary} center>
            The supplier decides. They may approve a different limit or period, which you
            will be asked to accept.
          </MandiText>
        </MandiStickyBar>
      }
    >
      <MandiCard>
        <MandiText variant="bodyEmphasis">Which supplier?</MandiText>
        {suppliers.isPending ? (
          <MandiSkeletonList count={2} />
        ) : suppliers.error ? (
          <MandiErrorState message="Couldn't load suppliers." onRetry={() => suppliers.refetch()} />
        ) : (
          (suppliers.data ?? []).map((supplier) => {
            const active = supplier.supplierStoreId === storeId;
            return (
              <Pressable
                key={supplier.supplierStoreId}
                onPress={() => setStoreId(supplier.supplierStoreId)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={styles.flex}>
                  <MandiText variant="body">{supplier.supplierName}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {supplier.storeName}
                  </MandiText>
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </Pressable>
            );
          })
        )}
      </MandiCard>

      <MandiFormField
        label="Credit limit"
        value={limit}
        onChangeText={(text) => setLimit(text.replace(/[^\d.]/g, ''))}
        placeholder="50000"
        keyboardType="decimal-pad"
        required
        hint="What you would want to owe at most at any one time."
      />

      <MandiCard>
        <MandiText variant="bodyEmphasis">Payment period</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          How long after an order you would settle it.
        </MandiText>
        <View style={styles.periods}>
          {PERIODS.map((option) => {
            const active = option === days;
            return (
              <Pressable
                key={option}
                onPress={() => setDays(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <MandiText
                  variant="captionEmphasis"
                  color={active ? Colors.primary : Colors.textSecondary}
                >
                  {option} days
                </MandiText>
              </Pressable>
            );
          })}
        </View>
      </MandiCard>

      <MandiFormField
        label="Purpose (optional)"
        value={purpose}
        onChangeText={setPurpose}
        placeholder="Daily vegetables, monthly staples…"
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
