import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailColors, DetailLayout, DetailType, WalletColors } from '@/theme';

/**
 * The coloured header of the Transaction details screen. The status bar behind it is the
 * same colour (the header runs under it, padded by the top inset), with light icons.
 */
export function DetailHeader({
  color, title, time, onBack, right,
}: { color: string; title: string; time?: string; onBack: () => void; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { backgroundColor: color, paddingTop: insets.top }]} testID="detail-header">
      <StatusBar style="light" backgroundColor={color} />
      <View style={styles.bar}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={styles.back}
          android_ripple={{ color: DetailColors.headerRipple, borderless: true, radius: 24 }}
        >
          <Ionicons name="arrow-back" size={DetailLayout.backGlyph} color={WalletColors.white} />
        </Pressable>
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        {right != null && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%' },
  bar: {
    height: DetailLayout.headerBar,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: DetailLayout.headerShift,
  },
  back: {
    width: DetailLayout.back,
    height: DetailLayout.back,
    marginLeft: DetailLayout.backLeft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: { marginLeft: 'auto' },
  titles: {
    marginLeft: DetailLayout.titleLeft - DetailLayout.back - DetailLayout.backLeft,
    marginTop: 1.2,
  },
  title: { ...DetailType.headerTitle, color: WalletColors.white },
  time: { ...DetailType.headerTime, marginTop: DetailLayout.headerTimeGap, color: WalletColors.white },
});
