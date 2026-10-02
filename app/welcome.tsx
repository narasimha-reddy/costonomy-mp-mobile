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
 * <p>It has one job: say what Mandi is and get to a phone number.
 *
 * <p><b>Two audiences arrive here, and the screen now says so.</b> One app serves
 * restaurants and suppliers, but every word of this screen used to be addressed
 * to a kitchen — "your suppliers", "your kitchen" — so a supplier invited to sign
 * up read a page about somebody else and had to take on trust that it was also
 * about them. Two blocks, one sentence each, let either reader find their own in
 * a glance. That is also the whole of the body: three feature claims were more
 * than a signed-out screen has earned the right to ask anyone to read.
 *
 * <p><b>No proof figures.</b> "3 suppliers compared per item" was a constant
 * typed into a landing page, not anything measured — doc 07 §4 forbids
 * fabricating a metric, and a made-up number on the first screen is the worst
 * place to start.
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
              One place{'\n'}to buy and sell.
            </MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.onGradientMuted} style={styles.lede}>
              The marketplace between restaurant kitchens and the suppliers who
              stock them.
            </MandiText>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Audience
            icon="restaurant-outline"
            title="If you run a kitchen"
            body="Compare what every supplier charges, order in one place, and follow it to your door."
          />
          <Audience
            icon="storefront-outline"
            title="If you supply one"
            body="Set your own prices, reach new kitchens, and get orders that are already funded."
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Spacing.lg + insets.bottom }]}>
        <MandiButton label="Get Started" size="lg" onPress={start} />
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

/**
 * One side of the market, in a sentence.
 *
 * <p>A card rather than the old flat row: two of these have to read as a choice
 * between two things, and a list reads as a sequence of claims about one.
 */
function Audience({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.audience}>
      <View style={styles.audienceIcon}>
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.audienceText}>
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
    // Deeper than the copy needs. With the body down to two blocks the gradient
    // is what gives the screen its weight, and a shallow band above a lot of
    // empty grey looked like a header that had lost its page.
    paddingBottom: Spacing.xxxl,
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
  // Centred in whatever is left between the hero and the footer. With only two
  // blocks the body no longer fills the screen, and pinned to the top it left a
  // hole above the button that read as content failing to load.
  body: { flex: 1, justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  audience: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  audienceIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  audienceText: { flex: 1, gap: Spacing.xs },
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
