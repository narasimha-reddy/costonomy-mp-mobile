import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton, MandiText, toneColors } from '@/components/common';
import { OrderStageStepper } from '@/components/delivery/OrderStageStepper';
import type { OrderTrackingView, TrackerTone } from '@/lib/delivery/orderTracking';
import { Colors, Radius, Spacing } from '@/theme';

const PILL_TONE: Record<TrackerTone, Parameters<typeof toneColors>[0]> = {
  neutral: 'neutral', info: 'info', success: 'success', warning: 'warning', danger: 'danger',
};

/** The headline of the tracker: what is happening now, when it will arrive, and where in the journey that is. */
export function OrderProgressHero({
  view, onTrack, orientation = 'horizontal', stepTimes,
}: {
  view: OrderTrackingView;
  onTrack?: () => void;
  orientation?: 'horizontal' | 'vertical';
  stepTimes?: Partial<Record<string, string | null>>;
}) {
  const pill = toneColors(PILL_TONE[view.tone]);
  const showPill = view.etaText != null && view.etaText !== view.headline;
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <MandiText
          variant="title"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          color={view.tone === 'danger' ? Colors.danger : Colors.textPrimary}
        >
          {view.headline}
        </MandiText>
        {view.subline != null && view.subline !== '' && (
          <MandiText variant="body" color={Colors.textSecondary}>{view.subline}</MandiText>
        )}
        {showPill && (
          <View style={[styles.pill, { backgroundColor: pill.bg }]} testID="eta-pill">
            <MandiText variant="captionEmphasis" color={pill.fg}>{view.etaText}</MandiText>
          </View>
        )}
      </View>
      <OrderStageStepper
        steps={view.steps}
        currentIndex={view.currentIndex}
        complete={view.complete}
        problem={view.problem}
        orientation={orientation}
        stepTimes={stepTimes}
      />
      {view.showTrack && onTrack != null && (
        <MandiButton label="Track" icon="navigate-outline" variant="secondary" size="md" onPress={onTrack} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  text: { gap: Spacing.xs },
  pill: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full },
});
