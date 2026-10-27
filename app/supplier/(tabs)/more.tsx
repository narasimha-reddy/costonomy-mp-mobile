import React, { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { submitGstinVerification, type Supplier } from '@/services/supplier';
import { newIdempotencyKey } from '@/lib/api/client';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import {
  MandiButton,
  MandiCard,
  MandiScreen,
  MandiSectionHeader,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * Everything that is not a daily task: the business, its stores, money, and the
 * account.
 *
 * <p><b>Verification leads, when it is not done.</b> A supplier whose
 * verification is pending cannot trade — `canTrade` is false and no restaurant
 * sees their catalog — and this is the only screen that can tell them so. Buried
 * under "settings" it would be a support ticket a week later.
 *
 * <p>Lifecycle, verification and `canTrade` are the Marketplace API's standing
 * (D-208). When the GSTIN was never sent for verification, or was not approved,
 * this is where it is sent (again), to common's verification queue.
 */
export default function SupplierMoreScreen() {
  const router = useRouter();
  const { me, signOut, accessToken } = useSession();
  const { supplier, stores, store } = useStore();
  const toast = useToast();
  const queryClient = useQueryClient();
  // One key per submission attempt, kept across retries so a retry is the same request.
  const verifyKey = useRef(newIdempotencyKey());

  const verified = supplier?.verificationStatus === 'VERIFIED';
  const canTrade = supplier?.canTrade ?? false;
  const canSubmit = supplier != null && supplier.lifecycleStatus !== 'SUSPENDED'
    && (supplier.verificationStatus === 'NOT_SUBMITTED' || supplier.verificationStatus === 'REJECTED');

  const submit = useMutation({
    mutationFn: () => submitGstinVerification(
      accessToken as string, supplier?.id as number, supplier?.legalName ?? '', verifyKey.current),
    onSuccess: () => {
      verifyKey.current = newIdempotencyKey();
      void queryClient.invalidateQueries({ queryKey: ['supplier', supplier?.id] });
      toast.show('Sent for verification', 'success');
    },
    onError: (caught) => {
      if (isDefinitiveFailure(caught)) verifyKey.current = newIdempotencyKey();
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error');
    },
  });

  return (
    <MandiScreen header={<SupplierHeader subtitle="More" />}>
      {supplier != null && !canTrade && (
        <MandiCard accentColor={Colors.warning}>
          <View style={styles.row}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.warning} />
            <View style={styles.flex}>
              <MandiText variant="bodyEmphasis">You cannot receive orders yet</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {notTradingReason(supplier)}
              </MandiText>
            </View>
          </View>
          <MandiStatusChip
            label={(supplier.verificationStatus ?? 'PENDING').replace(/_/g, ' ').toLowerCase()}
            tone={verified ? 'success' : 'pending'}
            size="sm"
          />
          {canSubmit && supplier.gstin != null && (
            <MandiButton
              label={supplier.verificationStatus === 'REJECTED' ? 'Send GSTIN again' : 'Send GSTIN for verification'}
              variant="secondary"
              size="sm"
              loading={submit.isPending}
              onPress={() => submit.mutate()}
              fullWidth={false}
            />
          )}
        </MandiCard>
      )}

      <View style={styles.section}>
        <MandiSectionHeader title="Business" />
        <Row
          icon="business-outline"
          title={supplier?.displayName ?? 'Your business'}
          subtitle={supplier?.legalName ?? 'Name, GSTIN and contact details'}
          onPress={() => router.push('/supplier/settings/business')}
        />
        <Row
          icon="storefront-outline"
          title="Stores"
          subtitle={`${stores.length} ${stores.length === 1 ? 'store' : 'stores'}${store ? ` · ${store.name} selected` : ''}`}
          onPress={() => router.push('/supplier/settings/stores')}
        />
        <Row
          icon="people-outline"
          title="Team"
          subtitle="Who runs which store, and who sees credit and settlements"
          onPress={() => router.push('/supplier/settings/team' as any)}
        />
      </View>

      <View style={styles.section}>
        <MandiSectionHeader title="Money" />
        <Row
          icon="cash-outline"
          title="Settlements"
          subtitle="What you have been paid, and the commission on each order"
          onPress={() => router.push('/supplier/settlements')}
        />
        <Row
          icon="bicycle-outline"
          title="Delivery charges"
          subtitle="Your share of deliveries you pay for, what you owe and what you have paid"
          onPress={() => router.push('/supplier/settlements/delivery-funding' as any)}
        />
        <Row
          icon="chatbubbles-outline"
          title="Disputes"
          subtitle="Problems restaurants raised, and refunds waiting for your answer"
          onPress={() => router.push('/supplier/disputes')}
        />
        <Row
          icon="card-outline"
          title="Credit"
          subtitle="Requests from restaurants and what you have extended"
          onPress={() => router.push('/supplier/credit')}
        />
      </View>

      <View style={styles.section}>
        <MandiSectionHeader title="Account" />
        <MandiCard>
          <MandiText variant="caption" color={Colors.textSecondary}>Signed in as</MandiText>
          <MandiText variant="bodyEmphasis">{me?.user.name ?? me?.user.phone}</MandiText>
          {me?.user.name && (
            <MandiText variant="caption" color={Colors.textSecondary}>{me.user.phone}</MandiText>
          )}
        </MandiCard>
        <MandiButton label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </MandiScreen>
  );
}

/** Why a supplier cannot take orders yet, from the server's standing. */
function notTradingReason(supplier: Supplier): string {
  if (supplier.lifecycleStatus === 'SUSPENDED') {
    return 'Your account is suspended, so restaurants cannot order from you. Contact support.';
  }
  switch (supplier.verificationStatus) {
    case 'VERIFIED':
      return 'Your account is verified but not active for trading. We will be in touch.';
    case 'NOT_SUBMITTED':
      return supplier.gstin == null
        ? 'Restaurants only see verified suppliers, and there is no GSTIN on file. Contact support to add one.'
        : 'Restaurants only see verified suppliers. Send your GSTIN to our team to be verified.';
    case 'REJECTED':
      return 'Your GST verification was not approved. Check your details under Business and send it again.';
    case 'INFORMATION_REQUESTED':
      return 'Our team needs more information to verify your GST details. We will be in touch.';
    default:
      return 'Restaurants only see verified suppliers. Your GST verification is with our team.';
  }
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
    >
      <View style={styles.entryIcon}>
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{title}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {subtitle}
        </MandiText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min + 12,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  pressed: { opacity: 0.75 },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
});
