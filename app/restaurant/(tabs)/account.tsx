import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import {
  MandiButton,
  MandiCard,
  MandiScreen,
  MandiSectionHeader,
  MandiText,
} from '@/components/common';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/theme';

/**
 * REST-ACCOUNT-01. Doc 05 §4.
 *
 * <p>The account is where things are changed, so each section leads somewhere
 * that changes them. It used to render the outlets as flat cards and the
 * memberships as more flat cards — a list of facts about an account nobody could
 * act on, on the one screen where acting on them is the point.
 *
 * <p>Roles are gone from here. "REST_OWNER" told a restaurant owner nothing they
 * did not know, in a vocabulary belonging to the permission catalogue rather than
 * to them, and what it actually decides now shows where it bites: a section is
 * read-only, or the button to add an outlet is not there.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { me, signOut } = useSession();
  const { outlets, outlet } = useOutlet();
  const { canForRestaurant } = usePermissions();

  const owner = canForRestaurant('RESTAURANT_EDIT', outlet?.restaurantId);
  // Not the same question. A store manager holds neither, and the restaurant is
  // not merely uneditable to them — the server answers 404, because a denial that
  // said 403 would confirm the restaurant exists (doc 09 §3).
  const seesRestaurant = canForRestaurant('RESTAURANT_VIEW', outlet?.restaurantId);

  return (
    <MandiScreen header={<RestaurantHeader screen="REST-ACCOUNT-01" subtitle="Account" />}>
      <MandiCard>
        <MandiText variant="caption" color={Colors.textSecondary}>Signed in as</MandiText>
        <MandiText variant="subtitle">{me?.user.name ?? me?.user.phone}</MandiText>
        {me?.user.name && (
          <MandiText variant="caption" color={Colors.textSecondary}>{me.user.phone}</MandiText>
        )}
      </MandiCard>

      <View style={styles.section}>
        <MandiSectionHeader title="Manage" />
        {seesRestaurant && (
          <Entry
            icon="business-outline"
            title="Your restaurant"
            detail={owner ? 'Name, company and GSTIN' : 'Name, company and GSTIN — view only'}
            onPress={() => router.push('/restaurant/settings/restaurant')}
          />
        )}
        <Entry
          icon="location-outline"
          title="Outlets"
          detail={`${outlets.length} on this account${owner ? ' · add or edit' : ''}`}
          onPress={() => router.push('/restaurant/settings/outlets')}
        />
        <Entry
          icon="card-outline"
          title="Credit"
          detail="What each supplier has extended, and what you owe"
          onPress={() => router.push('/restaurant/credit')}
        />
      </View>

      <MandiButton label="Sign out" onPress={signOut} variant="secondary" />
    </MandiScreen>
  );
}

/** A row that goes somewhere. The chevron is the promise that it does. */
function Entry({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <MandiCard onPress={onPress}>
      <View style={styles.entry}>
        <Ionicons name={icon} size={20} color={Colors.textSecondary} />
        <View style={styles.entryText}>
          <MandiText variant="bodyEmphasis">{title}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>{detail}</MandiText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  entryText: { flex: 1, gap: 2 },
});
