import React, { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from './MandiText';
import { Colors, IconSize, Spacing } from '@/theme';

/** How far from the end still counts as "at the bottom", in dp. */
const END_SLACK = 24;

interface Metrics { viewport: number; content: number; offset: number }

/**
 * Tracks whether a ScrollView has content below the fold. Spread `scrollProps`
 * on the ScrollView; `visible` is true only while the content is taller than the
 * viewport and the person has not yet reached the end.
 */
export function useMoreBelow() {
  const [m, setM] = useState<Metrics>({ viewport: 0, content: 0, offset: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const viewport = e.nativeEvent.layout.height;
    setM((p) => (p.viewport === viewport ? p : { ...p, viewport }));
  }, []);
  const onContentSizeChange = useCallback((_w: number, content: number) => {
    setM((p) => (p.content === content ? p : { ...p, content }));
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    setM({ viewport: layoutMeasurement.height, content: contentSize.height, offset: contentOffset.y });
  }, []);

  const visible = m.viewport > 0 && m.content > m.viewport + END_SLACK
    && m.offset + m.viewport < m.content - END_SLACK;

  return { visible, scrollProps: { onLayout, onContentSizeChange, onScroll, scrollEventThrottle: 16 } };
}

/**
 * A quiet "there is more below" line for the bottom of a scroll area, shown only
 * while it is true. Sits above a sticky footer so a disabled primary button is not
 * the only sign that a form has more fields to fill in.
 */
export function MandiMoreBelow({ visible, label, testID = 'more-below' }: { visible: boolean; label: string; testID?: string }) {
  if (!visible) return null;
  return (
    <View style={styles.row} testID={testID} accessibilityLiveRegion="polite">
      <Ionicons name="arrow-down" size={IconSize.sm} color={Colors.textSecondary} />
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.background,
  },
});
