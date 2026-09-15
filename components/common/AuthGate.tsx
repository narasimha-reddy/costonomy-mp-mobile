import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/contexts/SessionProvider';
import type { Audience } from '@/lib/session/types';
import { Colors, Spacing } from '@/theme';

/**
 * Keeps a route group behind a real session.
 *
 * <p>Two things make this a layout concern rather than an index-route one. A
 * deep link opens a screen inside the group without passing through `/` at all,
 * and signing out from a screen inside the group leaves that screen mounted —
 * the tokens are gone but the UI is still sitting there, which is how a signed-
 * out user ends up looking at an empty version of someone's dashboard.
 *
 * <p><b>This is navigation, not security.</b> Doc 09 §2: never rely on mobile
 * route visibility for security. The server authorises every call regardless of
 * what the client chose to render.
 */
export function AuthGate({
  audiences,
  children,
}: {
  /** Which audiences belong in this group. A mismatch goes back to `/` to be re-routed. */
  audiences: Audience[];
  children: React.ReactNode;
}) {
  const { restoring, authenticated, audience } = useSession();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!authenticated) return <Redirect href="/auth/phone" />;
  if (!audiences.includes(audience)) return <Redirect href="/" />;

  return <>{children}</>;
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
