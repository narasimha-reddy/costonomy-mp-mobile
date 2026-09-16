import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/contexts/SessionProvider';
import { MandiText } from '@/components/common';
import { Colors, Spacing } from '@/theme';

/**
 * REST-AUTH-01 — where the app decides who you are. §23A.5.
 *
 * <p><b>The destination is the server's answer, never a cached one.</b> The
 * session provider has just called `/auth/me`; this reads the memberships it
 * returned. Doc 09 §2 is explicit that route visibility is not security, and
 * doc 46 requires a revoked grant to take effect on the next request — a role
 * remembered on the device would keep a removed user inside their old
 * organisation until they reinstalled the app.
 *
 * <p>A signed-in user who belongs to no organisation is a real state, not an
 * error: they have an account and nothing to do with it yet.
 */
export default function Index() {
  const { restoring, authenticated, audience } = useSession();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <MandiText variant="display">Mandi</MandiText>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  // Signed out goes to the landing page, not straight to a form. Doc 05 §3:
  // the first screen has to say what this is before it asks for anything.
  if (!authenticated) return <Redirect href="/welcome" />;

  switch (audience) {
    case 'SUPPLIER':
      return <Redirect href="/supplier" />;
    case 'RESTAURANT':
    case 'BOTH':
      // Someone who is both goes to the restaurant side first and switches from
      // Account. v2.2 §5 is one app with role-based views, and buying is the
      // journey they are far more likely to have opened the app for.
      return <Redirect href="/restaurant" />;
    default:
      // Signed in, no organisation. They pick a side and register one.
      return <Redirect href="/onboarding/choose" />;
  }
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.background,
  },
});
