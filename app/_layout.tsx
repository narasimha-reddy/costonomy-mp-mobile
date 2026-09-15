import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  SourceSans3_300Light,
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
  SourceSans3_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/source-sans-3';
import { QueryClientProvider } from '@tanstack/react-query';
import { Colors } from '@/theme';
import { DeviceFrame, MandiOfflineBanner, MandiToastProvider } from '@/components/common';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { SessionProvider } from '@/contexts/SessionProvider';
import { createQueryClient } from '@/lib/query';

// Created once for the life of the process. A client rebuilt on render would
// throw away every cached query on each state change, which looks to a user like
// the app reloading itself at random.
const queryClient = createQueryClient();

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or unsupported on this platform — not fatal.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SourceSans3_300Light,
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
    SourceSans3_800ExtraBold,
  });

  useEffect(() => {
    // Hide on error too: a missing webfont should degrade to the system face,
    // not hold the app on the splash screen forever (§23A.46, no infinite loading).
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      {/* Inside the query client so a screen can invalidate on sign-out, and
          outside the navigator so the session is resolved before any route
          decides where to send the user. */}
      <SessionProvider>
        <SafeAreaProvider>
          <MandiToastProvider>
            {/* Web renders inside a phone-width frame; on a device this is a
                pass-through. A screen checked at desktop width is not checked. */}
            <DeviceFrame>
              <View style={styles.root}>
                <StatusBar style="dark" />
                {/* Mounted once here so no screen can forget the offline state. */}
                <OfflineBar />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: Colors.background },
                  }}
                />
              </View>
            </DeviceFrame>
          </MandiToastProvider>
        </SafeAreaProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function OfflineBar() {
  const { offline } = useNetworkStatus();
  return <MandiOfflineBanner visible={offline} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
});
