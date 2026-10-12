import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiText } from '@/components/common';
import { SegmentedProgress } from '@/components/delivery/SegmentedProgress';
import type { OrderTrackingView, TrackerTagKind } from '@/lib/delivery/orderTracking';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

const TAG: Record<TrackerTagKind, { bg: string; fg: string }> = {
  on_time: { bg: Colors.successLight, fg: Colors.successText },
  late: { bg: Colors.warningBanner, fg: Colors.warningText },
  searching: { bg: Colors.primaryLight, fg: Colors.primaryDark },
  delivered: { bg: Colors.successLight, fg: Colors.successText },
};

/**
 * The card at the top of the sheet: who it is with, the one line that matters (an ETA, or what is happening), how it
 * is going, and where in the journey that is. Everything is read from the view; nothing here decides a step.
 */
export function OrderProgressHero({ view, onTrack }: { view: OrderTrackingView; onTrack?: () => void }) {
  const tag = view.tag;
  return (
    <View style={styles.card}>
      {view.party != null && view.party !== '' && (
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>{view.party}</MandiText>
      )}
      <View style={styles.headlineRow}>
        <MandiText
          variant="trackerHeadline"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          color={view.tone === 'danger' ? Colors.danger : Colors.textPrimary}
          style={styles.headline}
        >
          {view.headline}
        </MandiText>
        {view.etaSmall != null && (
          <MandiText variant="bodyEmphasis" color={Colors.textSecondary}>{view.etaSmall}</MandiText>
        )}
      </View>
      {((view.subline != null && view.subline !== '') || tag != null) && (
        <View style={styles.status}>
          {view.subline != null && view.subline !== '' && (
            <MandiText variant="body" style={styles.sub}>{view.subline}</MandiText>
          )}
          {tag != null && (
            <View style={[styles.tag, { backgroundColor: TAG[tag.kind].bg }]} testID={`tag-${tag.kind}`}>
              {/* As written ("Delivered", "On time"): sentence case, never upper-cased (flow review 4). */}
              <MandiText variant="label" color={TAG[tag.kind].fg}>{tag.label}</MandiText>
            </View>
          )}
        </View>
      )}
      <View style={styles.progress}>
        <SegmentedProgress
          segments={view.segments}
          index={view.segmentIndex}
          fill={view.segmentFill}
          shimmer={view.searching}
          warning={view.delayed || view.partnerChanged}
          complete={view.complete && view.segmentIndex >= view.segments.length - 1}
          stepLine={view.stepLine}
          nextLine={view.nextLine}
        />
      </View>
      {view.showTrack && onTrack != null && (
        <View style={styles.track}>
          <MandiButton label="Track" icon="navigate-outline" variant="secondary" size="md" onPress={onTrack} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.hero,
    paddingHorizontal: Spacing.lg - 2,
    paddingTop: Spacing.lg - 2,
    paddingBottom: Spacing.md,
    ...Elevation.card,
  },
  headlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: Spacing.sm, marginTop: 2 },
  headline: { flexShrink: 1 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.sm, rowGap: Spacing.xs, marginTop: Spacing.xs },
  sub: { flexShrink: 1 },
  tag: { paddingHorizontal: Spacing.sm + 1, paddingVertical: 3, borderRadius: Radius.full },
  progress: { marginTop: Spacing.md },
  track: { marginTop: Spacing.md },
});
