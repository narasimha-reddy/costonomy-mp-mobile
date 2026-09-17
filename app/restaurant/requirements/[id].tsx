import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { Ionicons } from '@expo/vector-icons';
import { fetchRequirements, findSuppliersForRequirement } from '@/services/procurement';
import type { Alternatives, RequirementAlternative } from '@/models/procurement';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { formatQuantity } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * REST-REQ-01 detail. Doc 05 §9.
 *
 * <p>Requested, fulfilled and **remaining** per line, because remaining is the
 * whole point: guardrail 14 requires a shortfall to survive a supplier rejecting,
 * timing out or partially accepting, and this is where a restaurant sees that it
 * did — with a way to source the rest.
 */
export default function RequirementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requirementId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  // Read from the outlet's list rather than a by-id call: the list is already
  // cached from the tab the user came from, so this opens instantly.
  const query = useQuery({
    queryKey: ['outlet', outletId, 'requirements'],
    queryFn: () => fetchRequirements(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const requirement = (query.data ?? []).find((item) => item.id === requirementId);

  /**
   * Who could still supply what is missing.
   *
   * <p>Only asked once something is actually short: a fulfilled requirement has
   * nothing to source, and ranking every line of it would be a round trip spent
   * to display nothing.
   */
  const alternatives = useQuery({
    queryKey: ['requirement', requirementId, 'alternatives'],
    queryFn: () => findSuppliersForRequirement(accessToken as string, requirementId),
    enabled:
      accessToken != null
      && (requirement?.items ?? []).some((item) => Number(item.remainingQuantity) > 0),
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Requirement" subtitle={requirement ? `#${requirement.id}` : undefined} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load this requirement." onRetry={() => query.refetch()} />
      ) : requirement == null ? (
        <MandiErrorState
          title="Not found"
          message="This requirement no longer exists for this outlet."
        />
      ) : (
        <>
          <MandiCard>
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {requirement.items.length} item{requirement.items.length === 1 ? '' : 's'}
              </MandiText>
              <MandiStatusChip
                label={requirement.status.replace(/_/g, ' ').toLowerCase()}
                tone={requirement.status === 'FULFILLED' ? 'success' : 'pending'}
              />
            </View>
            {requirement.notes && (
              <MandiText variant="caption" color={Colors.textSecondary}>
                {requirement.notes}
              </MandiText>
            )}
          </MandiCard>

          {requirement.items.map((item) => {
            const remaining = Number(item.remainingQuantity);
            return (
              <MandiCard key={item.id}>
                <MandiText variant="bodyEmphasis">{item.productName}</MandiText>
                <View style={styles.figures}>
                  <Figure label="Needed" value={`${formatQuantity(item.requestedQuantity)} ${item.unit}`} />
                  <Figure label="Sourced" value={`${formatQuantity(item.fulfilledQuantity)} ${item.unit}`} />
                  <Figure
                    label="Still needed"
                    value={`${formatQuantity(item.remainingQuantity)} ${item.unit}`}
                    tone={remaining > 0 ? Colors.warning : Colors.success}
                  />
                </View>
                {remaining > 0 && (
                  <>
                    {/* Who can still cover the shortfall, ranked against what is
                        left rather than what was ordered — a supplier who can do
                        the remaining 8 kg counts even though they could never
                        have done the original 20 (doc 15). */}
                    <Shortfall
                      alternative={alternativeFor(alternatives.data, item.id)}
                      loading={alternatives.isPending}
                    />
                    <MandiButton
                      label="Find suppliers for the rest"
                      variant="secondary"
                      size="md"
                      // The requirement item rides along, so whatever is bought
                      // credits back to this need instead of becoming an
                      // unattached order (guardrail 14).
                      onPress={() => router.push(
                        `/restaurant/product/${item.canonicalProductId}`
                        + `?requirementItemId=${item.id}`,
                      )}
                    />
                  </>
                )}
              </MandiCard>
            );
          })}
        </>
      )}
    </MandiScreen>
  );
}

/**
 * What can be done about a shortfall, before anyone taps anything.
 *
 * <p>An item nobody can serve says why rather than looking like an item nobody
 * has looked at — doc 15: an unmet need is shown, never silently dropped.
 */
function Shortfall({
  alternative,
  loading,
}: {
  alternative: RequirementAlternative | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <MandiText variant="caption" color={Colors.textTertiary}>
        Looking for suppliers…
      </MandiText>
    );
  }
  if (alternative == null) return null;

  const count = alternative.offers.length;
  if (count === 0) {
    return (
      <View style={styles.shortfall}>
        <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
        <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
          {alternative.unservedReason
            ?? 'Nobody delivering to this outlet can cover the rest right now.'}
        </MandiText>
      </View>
    );
  }

  return (
    <View style={styles.shortfall}>
      <Ionicons name="storefront-outline" size={14} color={Colors.success} />
      <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
        {count} supplier{count === 1 ? '' : 's'} can cover the rest
      </MandiText>
    </View>
  );
}

function alternativeFor(
  alternatives: Alternatives | undefined,
  requirementItemId: number,
): RequirementAlternative | undefined {
  return alternatives?.items.find((item) => item.requirementItemId === requirementItemId);
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.figure}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis" color={tone}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginVertical: Spacing.sm },
  shortfall: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  flex: { flex: 1 },
  figure: { gap: Spacing.xs },
});
