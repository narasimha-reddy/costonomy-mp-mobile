import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CHIP_TEXT_MAX_SCALE } from '@/lib/wallet/billChip';
import type { BillBannerState } from '@/lib/wallet/history';
import { BillChipLayout, BillChipType, BillStatusColors, WalletLayout } from '@/theme';

/** Clear's 44 dp target comes from its slop, so the active banner is as tall as the prompt. */
const CLEAR_SLOP_V = (BillChipLayout.bannerMinHeight - BillChipType.banner.lineHeight) / 2;

/**
 * The strip under History's search box about payments that still need a bill. Prompt: how many,
 * and one tap shows them. Active: the list is showing them, and Clear takes the filter off.
 * The words ellipsize before the action does, so the action is always there to tap.
 */
export function BillBanner({ state, onShow, onClear }: {
  state: NonNullable<BillBannerState>;
  onShow: () => void;
  onClear: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const lines = fontScale > CHIP_TEXT_MAX_SCALE ? 2 : 1;
  const words = state.kind === 'prompt' ? state.text : 'Showing payments that need a bill';

  if (state.kind === 'prompt') {
    return (
      <Pressable
        testID="bill-banner"
        onPress={onShow}
        accessibilityRole="button"
        accessibilityLabel={`${words}. Show them`}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <Text style={[styles.words, styles.flex]} numberOfLines={lines} ellipsizeMode="tail">{words}</Text>
        <Text style={[styles.words, styles.action]} testID="bill-banner-action">Show them ›</Text>
      </Pressable>
    );
  }
  return (
    <View testID="bill-banner" style={styles.banner}>
      <Text style={[styles.words, styles.flex]} numberOfLines={lines} ellipsizeMode="tail">{words}</Text>
      <Pressable
        testID="bill-banner-action"
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel="Clear the bill filter"
        hitSlop={{ top: CLEAR_SLOP_V, bottom: CLEAR_SLOP_V, left: 8, right: 8 }}
        style={styles.clear}
      >
        <Text style={[styles.words, styles.action]}>· Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BillChipLayout.bannerMinHeight,
    marginHorizontal: WalletLayout.searchMargin,
    marginTop: 8,
    paddingHorizontal: BillChipLayout.bannerPadX,
    paddingVertical: BillChipLayout.bannerPadY,
    borderRadius: BillChipLayout.bannerRadius,
    borderWidth: 1,
    borderColor: BillStatusColors.bannerBorder,
    backgroundColor: BillStatusColors.bannerBg,
  },
  pressed: { backgroundColor: BillStatusColors.bannerPressed },
  flex: { flex: 1 },
  words: {
    flexShrink: 1,
    fontFamily: BillChipType.banner.fontFamily,
    fontSize: BillChipType.banner.fontSize,
    lineHeight: BillChipType.banner.lineHeight,
    color: BillStatusColors.bannerText,
  },
  action: {
    flexShrink: 0,
    marginLeft: 6,
    fontFamily: BillChipType.bannerStrong.fontFamily,
    color: BillStatusColors.bannerAction,
  },
  clear: { flexShrink: 0, justifyContent: 'center' },
});
