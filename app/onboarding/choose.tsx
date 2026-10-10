import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { MandiButton, MandiHeader, MandiScreen, MandiText } from '@/components/common';
import { track } from '@/analytics';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-ONB-01';

/**
 * Signed in, belonging to no organisation. Which side are you?
 *
 * <p>Reached only when `/auth/me` returns no memberships — so a user who has
 * been invited to a restaurant never sees it, and a user who registers here is
 * the owner of what they create.
 *
 * <p><b>The choice is not stored on the device.</b> It selects a registration
 * form, and the organisation that form creates is what makes the answer true.
 * Remembering "they said supplier" would put a claim about a role in the one
 * place doc 46 says it must never live.
 */
export default function ChooseSideScreen() {
  const router = useRouter();
  const { me, signOut } = useSession();

  function choose(side: 'restaurant' | 'supplier') {
    track('onboarding_side_chosen', { screen: SCREEN }, { side });
    router.push(`/onboarding/${side}`);
  }

  return (
    <MandiScreen header={<MandiHeader title="Welcome" />}>
      <View style={styles.intro}>
        <MandiText variant="display">What brings you here?</MandiText>
        <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
          You are signed in as {me?.user.phone}. Tell us which side of the market you
          are on and we will set you up.
        </MandiText>
      </View>

      <Side
        icon="restaurant-outline"
        title="I run a restaurant"
        body="Compare suppliers, order in one place, and track every delivery to your kitchen."
        points={['Compare every supplier on price', 'Order on credit once approved', 'Check in what actually arrives']}
        onPress={() => choose('restaurant')}
      />

      <Side
        icon="storefront-outline"
        title="I supply restaurants"
        body="List what you stock, answer orders as they arrive, and get settled on schedule."
        points={['Your catalog and your prices', 'Accept in full or in part', 'Payouts with commission itemised']}
        onPress={() => choose('supplier')}
      />

      <View style={styles.footer}>
        <MandiText variant="caption" color={Colors.textTertiary} center>
          Been invited by someone already? Ask them to add this number, then sign in again.
        </MandiText>
        <MandiButton label="Sign out" variant="tertiary" size="md" onPress={signOut} />
      </View>
    </MandiScreen>
  );
}

function Side({
  icon,
  title,
  body,
  points,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  points: string[];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={24} color={Colors.primary} />
        </View>
        <View style={styles.cardTitle}>
          <MandiText variant="subtitle">{title}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>{body}</MandiText>
        </View>
      </View>

      <View style={styles.points}>
        {points.map((point) => (
          <View key={point} style={styles.point}>
            <Ionicons name="checkmark" size={14} color={Colors.success} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              {point}
            </MandiText>
          </View>
        ))}
      </View>

      <View style={styles.cta}>
        <MandiText variant="captionEmphasis" color={Colors.primary}>Set this up</MandiText>
        <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { gap: Spacing.sm },
  card: {
    gap: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    ...Elevation.card,
  },
  pressed: { opacity: 0.8 },
  cardHead: { flexDirection: 'row', gap: Spacing.md },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  cardTitle: { flex: 1, gap: Spacing.xs },
  points: { gap: Spacing.xs },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  footer: { gap: Spacing.sm, marginTop: Spacing.lg },
});
