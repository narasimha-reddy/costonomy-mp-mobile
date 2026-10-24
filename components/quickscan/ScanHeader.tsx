import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackGlyph, HelpGlyph } from '@/components/quickscan/ScanGlyphs';
import { WalletColors, WalletLayout, WalletType } from '@/theme';

/** "← Scan any QR / Works with any UPI QR … (?)", floated over the camera. */
export function ScanHeader({ onBack, onHelp }: { onBack: () => void; onHelp: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.row, { top: insets.top + WalletLayout.scanHeaderTop }]}
    >
      <Pressable
        testID="scan-back"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.target, { marginLeft: WalletLayout.scanBackLeft }]}
      >
        <BackGlyph />
      </Pressable>
      <View style={styles.titles} accessibilityRole="header">
        <Text style={styles.title}>Scan any QR</Text>
        <Text style={styles.subtitle}>Works with any UPI QR</Text>
      </View>
      <Pressable
        testID="scan-help"
        onPress={onHelp}
        accessibilityRole="button"
        accessibilityLabel="Help with scanning"
        style={[styles.target, styles.help]}
      >
        <HelpGlyph />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: WalletLayout.scanHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  target: {
    width: WalletLayout.tap,
    height: WalletLayout.tap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { marginLeft: WalletLayout.scanTitleLeft, paddingTop: 2.4 },
  title: { ...WalletType.scanTitle, color: WalletColors.white },
  subtitle: {
    ...WalletType.scanSubtitle,
    marginTop: WalletLayout.scanSubtitleGap,
    color: WalletColors.scanSubtitle,
  },
  help: { position: 'absolute', right: WalletLayout.scanHelpRight },
});
