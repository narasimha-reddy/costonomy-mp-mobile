import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/contexts/SessionProvider';
import { MandiButton, MandiEmptyState } from '@/components/common';
import { Spacing } from '@/theme';

/**
 * Signed in, but part of no organisation yet.
 *
 * <p>A real state rather than an error: someone downloaded the app and verified
 * a phone number, and nobody has added them to a restaurant or a supplier. The
 * honest thing is to say so and offer the two ways forward, rather than drop them
 * into an empty restaurant dashboard that implies their data failed to load.
 *
 * <p>Creating an organisation lands in a later milestone; until then this names
 * the situation and offers a way out, which is better than a screen that lies.
 */
export default function OnboardingScreen() {
  const { signOut } = useSession();

  return (
    <View style={styles.screen}>
      <MandiEmptyState
        icon="business-outline"
        title="You're not part of an organisation yet"
        description="Ask your restaurant or supplier admin to invite you, and this will fill in as soon as they do."
      />
      <MandiButton label="Sign out" onPress={signOut} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
});
