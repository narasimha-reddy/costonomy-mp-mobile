import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Radius, Spacing, TrackLayout } from '@/theme';

interface EtaPillProps {
  text: string;
  /** A second caption line, e.g. "Updated 3 min ago". Built by the caller. */
  subText?: string | null;
  tone: 'normal' | 'warning';
  onRefresh?: () => void;
  refreshing?: boolean;
  /** The surface the pill sits on: the green tracking header or a white bar. */
  on: 'green' | 'white';
}

/** Pill background and text colour per surface and tone. */
function palette(on: EtaPillProps['on'], tone: EtaPillProps['tone']) {
  if (tone === 'warning') return { bg: Colors.warningBanner, fg: Colors.warningText };
  if (on === 'green') return { bg: Colors.trackHeaderPill, fg: Colors.onTrackHeader };
  return { bg: Colors.background, fg: Colors.textPrimary };
}

/**
 * The ETA pill under the tracking title: one line with an ellipsis, an optional
 * stale caption beneath it, and a refresh button that spins while refetching.
 * The text is whatever the caller built; nothing is computed here.
 */
export function EtaPill({ text, subText, tone, onRefresh, refreshing = false, on }: EtaPillProps) {
  const { bg, fg } = palette(on, tone);
  const label = subText ? `${text}, ${subText}` : text;
  return (
    <View style={styles.row}>
      <View
        testID="eta-pill"
        accessible
        accessibilityLabel={label}
        style={[styles.pill, { backgroundColor: bg }]}
      >
        <MandiText variant="pillText" color={fg} numberOfLines={1} ellipsizeMode="tail">
          {text}
        </MandiText>
        {subText ? (
          <MandiText variant="caption" color={fg} numberOfLines={1} ellipsizeMode="tail">
            {subText}
          </MandiText>
        ) : null}
      </View>
      {onRefresh ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          accessibilityState={{ busy: refreshing }}
          onPress={onRefresh}
          hitSlop={10}
          style={[styles.refresh, { backgroundColor: bg }]}
        >
          {refreshing ? (
            <ActivityIndicator testID="eta-pill-spinner" size="small" color={fg} />
          ) : (
            <Ionicons name="refresh" size={16} color={fg} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, maxWidth: '100%' },
  pill: {
    flexShrink: 1,
    minHeight: TrackLayout.pillHeight,
    justifyContent: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  refresh: { width: 28, height: 28, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});
