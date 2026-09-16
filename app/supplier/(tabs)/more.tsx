import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { SupplierHeader } from '@/components/supplier/SupplierHeader';
import {
  MandiButton,
  MandiCard,
  MandiScreen,
  MandiSectionHeader,
  MandiStatusChip,
  MandiText,
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
 */
export default function SupplierMoreScreen() {
  const router = useRouter();
  const { me, signOut } = useSession();
  const { supplier, stores, store } = useStore();

  const verified = supplier?.verificationStatus === 'VERIFIED';
  const canTrade = supplier?.canTrade ?? false;

  return (
    <MandiScreen header={<SupplierHeader subtitle="More" />}>
      {supplier != null && !canTrade && (
        <MandiCard accentColor={Colors.warning}>
          <View style={styles.row}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.warning} />
            <View style={styles.flex}>
              <MandiText variant="bodyEmphasis">You cannot receive orders yet</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {verified
                  ? 'Your account is verified but not active for trading. We will be in touch.'
                  : 'Restaurants only see verified suppliers. Your GST verification is with our team.'}
              </MandiText>
            </View>
          </View>
          <MandiStatusChip
            label={(supplier.verificationStatus ?? 'PENDING').replace(/_/g, ' ').toLowerCase()}
            tone={verified ? 'success' : 'pending'}
            size="sm"
          />
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
