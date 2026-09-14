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
import { Colors } from '@/theme';
import { MandiOfflineBanner, MandiToastProvider } from '@/components/common';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

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
    <SafeAreaProvider>
      <MandiToastProvider>
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
      </MandiToastProvider>
    </SafeAreaProvider>
  );
}

function OfflineBar() {
  const { offline } = useNetworkStatus();
  return <MandiOfflineBanner visible={offline} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
});
