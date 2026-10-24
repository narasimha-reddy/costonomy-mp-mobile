import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanOverlay } from '@/components/quickscan/ScanOverlay';
import { scanGeometry } from '@/lib/quickscan/scanGeometry';
import { WalletColors, WalletLayout, WalletType } from '@/theme';

export interface ScanAction {
  key: string;
  label: string;
  accessibilityLabel: string;
  glyph: React.ReactNode;
  onPress: () => void;
  /** The torch while it is on: the disc turns orange. */
  active?: boolean;
  disabled?: boolean;
}

/**
 * The scan screen's picture, shared by the native and web scanners: whatever is behind
 * (the camera feed, or a flat backdrop), the dimmed overlay with its window, the round
 * Upload / Torch buttons, the "Or enter a UPI ID" link and an error line.
 *
 * <p>Sizes come from the container's own measured size, not the window's, so the web build
 * inside its phone-width frame lays out like a phone.
 */
export function ScanSurface({
  background, actions, error, onManualEntry, windowContent, children,
}: {
  background: React.ReactNode;
  actions: ScanAction[];
  error?: string | null;
  onManualEntry: () => void;
  /** Shown inside the window (the permission prompt). */
  windowContent?: React.ReactNode;
  /** The header, over everything. */
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const geo = size == null ? null : scanGeometry(size.width, size.height, insets.top);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
  }

  return (
    <View style={styles.root} onLayout={onLayout} testID="scan-surface">
      {background}
      {geo != null && (
        <>
          <ScanOverlay window={geo.window} />
          {windowContent != null && (
            <View style={[styles.windowContent, {
              left: geo.window.left, top: geo.window.top, width: geo.window.size, height: geo.window.size,
            }]}
            >
              {windowContent}
            </View>
          )}
          <View style={[styles.chips, { top: geo.chipsTop }]}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                testID={`scan-action-${action.key}`}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                accessibilityState={{ disabled: action.disabled === true, selected: action.active === true }}
                disabled={action.disabled}
                onPress={action.onPress}
                style={styles.column}
              >
                {({ pressed }) => (
                  <>
                    <View style={[
                      styles.chip,
                      pressed && styles.chipPressed,
                      action.active === true && styles.chipOn,
                    ]}
                    >
                      {action.glyph}
                    </View>
                    <Text style={styles.chipLabel}>{action.label}</Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable
            testID="scan-manual-entry"
            accessibilityRole="button"
            accessibilityLabel="Enter a UPI ID instead"
            onPress={onManualEntry}
            style={[styles.link, { top: geo.linkTop - LINK_TEXT_OFFSET }]}
          >
            <Text style={styles.linkText}>Or enter a UPI ID</Text>
            <View style={styles.underline} />
          </Pressable>
          {error != null && (
            <View style={[styles.errorWrap, { top: geo.linkTop + 40 }]} pointerEvents="none">
              <Text style={styles.errorText} accessibilityLiveRegion="polite" testID="scan-error">
                {error}
              </Text>
            </View>
          )}
        </>
      )}
      {children}
    </View>
  );
}

/** From the top of the 44 dp link target to the top of its text (the target centres the text + underline). */
const LINK_TEXT_OFFSET = (WalletLayout.tap
  - (WalletType.scanLink.lineHeight + WalletLayout.scanLinkUnderlineGap + WalletLayout.scanLinkUnderline)) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WalletColors.ink },
  windowContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    padding: WalletLayout.scanBracketInset,
  },
  chips: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: WalletLayout.scanChipColumnGap,
  },
  column: { width: WalletLayout.scanChipColumn, minHeight: 48, alignItems: 'center' },
  chip: {
    width: WalletLayout.scanChip,
    height: WalletLayout.scanChip,
    borderRadius: WalletLayout.scanChip / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WalletColors.scanChip,
  },
  chipPressed: { backgroundColor: WalletColors.scanChipPressed },
  chipOn: { backgroundColor: WalletColors.scanChipTorchOn },
  chipLabel: {
    ...WalletType.scanChipLabel,
    marginTop: WalletLayout.scanChipLabelGap,
    color: WalletColors.white,
    textAlign: 'center',
  },
  link: {
    position: 'absolute',
    alignSelf: 'center',
    minHeight: WalletLayout.tap,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  linkText: { ...WalletType.scanLink, color: WalletColors.white, textAlign: 'center' },
  underline: {
    height: WalletLayout.scanLinkUnderline,
    marginTop: WalletLayout.scanLinkUnderlineGap,
    backgroundColor: WalletColors.orange,
  },
  errorWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  errorText: {
    ...WalletType.scanChipLabel,
    lineHeight: 12,
    color: WalletColors.white,
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: WalletColors.scanDim,
  },
});
