import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import { createDispute, fetchDisputes } from '@/services/trust';
import type { DisputeCategory } from '@/models/trust';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-DISPUTE-01';

const CATEGORIES: { key: DisputeCategory; label: string }[] = [
  { key: 'SHORT_QUANTITY', label: 'Short quantity' },
  { key: 'DAMAGED', label: 'Damaged' },
  { key: 'WRONG_PRODUCT', label: 'Wrong product' },
  { key: 'EXPIRED', label: 'Expired stock' },
  { key: 'QUALITY', label: 'Quality' },
  { key: 'INCORRECT_INVOICE', label: 'Invoice is wrong' },
  { key: 'OTHER', label: 'Something else' },
];

type Step = 'category' | 'items' | 'detail';

/**
 * REST-DISPUTE-01. Doc 05 §21.
 *
 * <p>Category, then affected items and quantities, then the detail. Stepped
 * because a dispute raised in one screenful is a dispute nobody can act on —
 * "it was wrong" with no line and no quantity puts the work on the person reading
 * it, and that person is a supplier with their money held up.
 *
 * <p><b>The order stays delivered.</b> §21 says so explicitly and the screen says
 * it too: a dispute is tracked separately and does not reverse the delivery. A
 * restaurant that believes raising one un-delivers their order will raise it for
 * the wrong reasons.
 *
 * <p>Evidence upload lands with file handling; the field accepts a reference
 * today rather than pretending a camera roll exists.
 */
export default function DisputeScreen() {
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();

  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<DisputeCategory | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [description, setDescription] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const existing = useQuery({
    queryKey: ['supplier-order', orderId, 'disputes'],
    queryFn: () => fetchDisputes(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  // Memoised so the `chosen` filter below is not rebuilt on every render.
  const items = useMemo(() => order.data?.items ?? [], [order.data]);

  const chosen = useMemo(
    () => items.filter((item) => (quantities[item.id] ?? 0) > 0),
    [items, quantities],
  );

  const submit = useMutation({
    mutationFn: () =>
      createDispute(accessToken as string, orderId, {
        category: category as DisputeCategory,
        description,
        items: chosen.map((item) => ({
          supplierOrderItemId: item.id,
          disputedQuantity: String(quantities[item.id]),
        })),
      }, idempotencyKey),
    onSuccess: (dispute) => {
      track('dispute_raised', { screen: SCREEN, entityId: orderId }, { category });
      toast.show(`Dispute ${dispute.disputeNumber} raised`, 'success');
      void existing.refetch();
      router.replace('/restaurant/(tabs)/orders');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not raise that.', 'error'),
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Raise a dispute" subtitle={order.data?.orderNumber} back />}
      footer={renderFooter()}
    >
      {order.isPending ? (
        <MandiSkeletonList count={3} />
      ) : order.error ? (
        <MandiErrorState message="Couldn't load this order." onRetry={() => order.refetch()} />
      ) : (
        <>
          {(existing.data ?? []).length > 0 && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Already raised</MandiText>
              {(existing.data ?? []).map((dispute) => (
                <View key={dispute.id} style={styles.row}>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {dispute.disputeNumber}
                  </MandiText>
                  <MandiStatusChip
                    label={dispute.status.replace(/_/g, ' ').toLowerCase()}
                    tone={dispute.status === 'RESOLVED' ? 'success' : 'pending'}
                    size="sm"
                  />
                </View>
              ))}
            </MandiCard>
          )}

          <View style={styles.assurance}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              Your order stays delivered. A dispute is tracked separately and does not reverse it.
            </MandiText>
          </View>

          {step === 'category' && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">What went wrong?</MandiText>
              <View style={styles.categories}>
                {CATEGORIES.map((option) => {
                  const active = option.key === category;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setCategory(option.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      {active && (
                        <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                      )}
                      <MandiText
                        variant="caption"
                        color={active ? Colors.primary : Colors.textSecondary}
                      >
                        {option.label}
                      </MandiText>
                    </Pressable>
                  );
                })}
              </View>
            </MandiCard>
          )}

          {step === 'items' && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Which items, and how much?</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Leave a line at zero if it was fine.
              </MandiText>
              {items.map((item) => {
                const agreed = Number(item.acceptedQuantity ?? item.requestedQuantity);
                return (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.flex}>
                      <MandiText variant="body">{item.productName}</MandiText>
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {formatQuantity(String(agreed))} {item.unit} delivered
                      </MandiText>
                    </View>
                    <MandiQuantityStepper
                      value={quantities[item.id] ?? 0}
                      onChange={(value) =>
                        setQuantities((current) => ({ ...current, [item.id]: value }))
                      }
                      min={0}
                      max={agreed}
                      unit={item.unit}
                    />
                  </View>
                );
              })}
            </MandiCard>
          )}

          {step === 'detail' && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Tell them what happened</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {chosen.length} item{chosen.length === 1 ? '' : 's'} ·{' '}
                {CATEGORIES.find((c) => c.key === category)?.label}
              </MandiText>
              <MandiFormField
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="What you found when you opened it"
                multiline
                required
              />
            </MandiCard>
          )}
        </>
      )}
    </MandiScreen>
  );

  function renderFooter() {
    if (order.data == null) return undefined;

    if (step === 'category') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Next"
            size="lg"
            disabled={category == null}
            onPress={() => setStep('items')}
          />
        </MandiStickyBar>
      );
    }

    if (step === 'items') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Next"
            size="lg"
            disabled={chosen.length === 0}
            onPress={() => setStep('detail')}
          />
          <MandiButton label="Back" variant="tertiary" size="md" onPress={() => setStep('category')} />
        </MandiStickyBar>
      );
    }

    return (
      <MandiStickyBar>
        <MandiButton
          label="Raise dispute"
          size="lg"
          disabled={description.trim().length === 0}
          loading={submit.isPending}
          onPress={() => submit.mutate()}
        />
        <MandiButton label="Back" variant="tertiary" size="md" onPress={() => setStep('items')} />
      </MandiStickyBar>
    );
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  assurance: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
});
