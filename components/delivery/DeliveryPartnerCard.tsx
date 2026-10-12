import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { partnerDisplayName } from '@/lib/delivery/deliveryPartner';
import { initials } from '@/lib/delivery/orderTracking';
import { AvatarSize, Colors, Elevation, IconSize, Radius, Spacing, TrackingLayout, hitSlopFor } from '@/theme';

/**
 * Who is carrying the order: initials, the full name (never cut short, because it is what the person at the door is
 * told to look for), "Delivery partner", and a call button when there is a number and the caller allows it.
 *
 * <p>Once the order has arrived the same card reads "Delivered by {name}" and has no call button. With a
 * `placeholder` and no name it is the "Assigning" card: a title and a line, nothing to tap. Buyer callers never pass
 * `vehicle`; the supplier keeps passing it and keeps the plate and its "Your delivery partner" heading.
 */
export function DeliveryPartnerCard({
  name, vehicle, phone, showCall, delivered = false, placeholder,
}: {
  name: string | null;
  vehicle?: string | null;
  phone?: string | null;
  showCall: boolean;
  delivered?: boolean;
  placeholder?: { title: string; body: string };
}) {
  if (name == null) {
    if (!placeholder) return null;
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="person-outline" size={IconSize.lg} color={Colors.partnerAvatarText} />
          </View>
          <View style={styles.info}>
            <MandiText variant="subtitle">{placeholder.title}</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>{placeholder.body}</MandiText>
          </View>
        </View>
      </View>
    );
  }
  // A placeholder such as "Rider name" is not a name: say who they are, not what the field was called.
  const realName = partnerDisplayName(name);
  const callable = !delivered && showCall && !!phone;
  const supplierLayout = !!vehicle;
  return (
    <View style={styles.card}>
      {!delivered && supplierLayout && (
        <MandiText variant="caption" color={Colors.textSecondary} style={styles.label}>Your delivery partner</MandiText>
      )}
      <View style={styles.row}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {realName != null ? (
            <MandiText variant="subtitle" color={Colors.partnerAvatarText}>{initials(realName)}</MandiText>
          ) : (
            <Ionicons name="person-outline" size={IconSize.lg} color={Colors.partnerAvatarText} />
          )}
        </View>
        <View style={styles.info}>
          <MandiText variant="subtitle">{delivered
              ? (realName != null ? `Delivered by ${realName}` : 'Delivered by a delivery partner')
              : (realName ?? 'Delivery partner')}</MandiText>
          {!delivered && !supplierLayout && realName != null && (
            <MandiText variant="caption" color={Colors.textSecondary}>Delivery partner</MandiText>
          )}
          {vehicle ? (
            <View style={styles.plate}>
              <MandiText variant="label" color={Colors.textPrimary}>{vehicle}</MandiText>
            </View>
          ) : null}
        </View>
        {callable && (
          <Pressable
            onPress={() => { void Linking.openURL(`tel:${phone}`); }}
            accessibilityRole="button"
            accessibilityLabel={`Call ${realName ?? 'delivery partner'}`}
            hitSlop={hitSlopFor(TrackingLayout.callButton)}
            style={({ pressed }) => [styles.call, pressed && styles.pressed]}
          >
            <Ionicons name="call-outline" size={IconSize.md} color={Colors.primaryDark} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg - 2,
    paddingVertical: Spacing.md,
    ...Elevation.card,
  },
  label: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: AvatarSize.lg,
    height: AvatarSize.lg,
    borderRadius: Radius.full,
    backgroundColor: Colors.partnerAvatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-start' },
  plate: {
    borderWidth: 1.5,
    borderColor: Colors.textPrimary,
    borderRadius: Radius.sm - 2,
    paddingHorizontal: Spacing.sm - 2,
  },
  call: {
    width: TrackingLayout.callButton,
    height: TrackingLayout.callButton,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
