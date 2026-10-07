import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { EtaPill } from './EtaPill';
import { Colors, Spacing, TouchTarget, TrackLayout } from '@/theme';

interface GreenTrackingHeaderProps {
  supplierLine: string | null;
  title: string;
  pill: { text: string; subText?: string | null; tone: 'normal' | 'warning' } | null;
  /** `live` is the green bar; `neutral` (cancelled, failed, draft) is a white one. */
  tone: 'live' | 'neutral';
  /** Safe-area top inset: the bar draws under the status bar. */
  insetTop: number;
  onBack: () => void;
  /** Top-right slot, e.g. the Help chip. */
  right?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * The buyer tracking header: back, supplier line, an optional right slot, the
 * title (a header and a polite live region so a changed status is announced)
 * and the ETA pill. All strings arrive built; this component only lays them out.
 */
export function GreenTrackingHeader({
  supplierLine,
  title,
  pill,
  tone,
  insetTop,
  onBack,
  right,
  onRefresh,
  refreshing,
}: GreenTrackingHeaderProps) {
  const live = tone === 'live';
  const ink = live ? Colors.onTrackHeader : Colors.textPrimary;
  return (
    <View
      testID="tracking-header"
      style={[
        styles.root,
        { backgroundColor: live ? Colors.trackHeader : Colors.surface, paddingTop: insetTop },
      ]}
    >
      {live ? <StatusBar style="light" /> : null}
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          style={styles.slot}
        >
          <Ionicons name="arrow-back" size={22} color={ink} />
        </Pressable>
        <MandiText
          variant="captionEmphasis"
          color={live ? Colors.onTrackHeaderMuted : Colors.textSecondary}
          numberOfLines={1}
          style={styles.supplier}
        >
          {supplierLine ?? ''}
        </MandiText>
        <View style={[styles.slot, styles.right]}>{right}</View>
      </View>
      <MandiText
        variant="trackHeaderTitle"
        color={ink}
        numberOfLines={2}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={styles.title}
      >
        {title}
      </MandiText>
      {pill ? (
        <View style={styles.pillRow}>
          <EtaPill
            text={pill.text}
            subText={pill.subText}
            tone={pill.tone}
            on={live ? 'green' : 'white'}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: TrackLayout.headerBottomPad,
    alignItems: 'center',
  },
  nav: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  slot: { minWidth: 48, minHeight: TouchTarget.min + 4, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  supplier: { flex: 1, textAlign: 'center' },
  title: { marginTop: Spacing.xs, textAlign: 'center', alignSelf: 'stretch' },
  pillRow: { marginTop: Spacing.sm, alignItems: 'center', alignSelf: 'stretch' },
});
