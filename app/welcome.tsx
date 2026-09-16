import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiButton, MandiText } from '@/components/common';
import { track } from '@/analytics';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const SCREEN = 'REST-AUTH-01';

/**
 * The landing screen. The first thing anyone sees, signed out.
 *
 * <p>It has one job: say what Mandi is and get to a phone number. Everything
 * below the hero is there to answer "why would I type my number in" — three
 * claims a restaurant can check against their own week, not feature names.
 *
 * <p><b>No stock photography and no illustration.</b> There is no asset pipeline
 * here yet, and a placeholder image on the first screen reads as an unfinished
 * app. Type, a gradient and a little iconography carry it instead, which also
 * means the screen weighs nothing and renders identically offline.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function start() {
    track('start_sign_in', { screen: SCREEN });
    router.push('/auth/phone');
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + Spacing.xxxl }]}
        >
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Ionicons name="leaf" size={18} color={Colors.onGradient} />
            </View>
            <MandiText variant="bodyEmphasis" color={Colors.onGradient}>
              Mandi
            </MandiText>
            <View style={styles.byline}>
              <MandiText variant="caption" color={Colors.onGradientMuted}>
                by Costonomy
              </MandiText>
            </View>
          </View>

          <View style={styles.heroCopy}>
            <MandiText variant="hero" color={Colors.onGradient}>
              Every supplier,{'\n'}one price list.
            </MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.onGradientMuted} style={styles.lede}>
              Compare what your suppliers actually charge, order in one place, and
              know where it is until it reaches your kitchen.
            </MandiText>
          </View>

          <View style={styles.proofRow}>
            <Proof value="3 suppliers" label="compared per item" />
            <View style={styles.proofRule} />
            <Proof value="60 sec" label="to accept or decline" />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Claim
            icon="pricetags-outline"
            title="See the real price"
            body="Every supplier stocking an item, side by side, with GST and the total you will actually pay."
          />
          <Claim
            icon="navigate-outline"
            title="Know where it is"
            body="Live tracking from the moment it is packed, and a receiving check that records what actually arrived."
          />
          <Claim
            icon="wallet-outline"
            title="Buy on your terms"
            body="Pay now, or on credit your suppliers approve — with what you owe and what is left always on one screen."
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Spacing.lg + insets.bottom }]}>
        <MandiButton label="Get started" size="lg" onPress={start} />
        <Pressable
          onPress={start}
          accessibilityRole="button"
          accessibilityLabel="Sign in to an existing account"
          style={styles.signIn}
        >
          <MandiText variant="caption" color={Colors.textSecondary}>
            Already have an account?{' '}
            <MandiText variant="captionEmphasis" color={Colors.primary}>Sign in</MandiText>
          </MandiText>
        </Pressable>
      </View>
    </View>
  );
}

function Proof({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.proof}>
      <MandiText variant="subtitle" color={Colors.onGradient}>{value}</MandiText>
      <MandiText variant="caption" color={Colors.onGradientMuted}>{label}</MandiText>
    </View>
  );
}

function Claim({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.claim}>
      <View style={styles.claimIcon}>
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.claimText}>
        <MandiText variant="bodyEmphasis">{title}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{body}</MandiText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  hero: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    gap: Spacing.xxl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mark: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.onGradientSurface,
  },
  byline: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.onGradientSurface,
  },
  heroCopy: { gap: Spacing.md },
  lede: { maxWidth: 330 },
  proofRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  proof: { gap: 2 },
  proofRule: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: Colors.onGradientMuted },
  body: { padding: Spacing.xl, gap: Spacing.xl },
  claim: { flexDirection: 'row', gap: Spacing.md },
  claimIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  claimText: { flex: 1, gap: Spacing.xs },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  signIn: { alignItems: 'center', justifyContent: 'center', minHeight: TouchTarget.min },
});
