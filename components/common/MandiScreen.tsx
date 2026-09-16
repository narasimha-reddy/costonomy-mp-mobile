import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';

/**
 * The standard screen shell: safe-area insets, the one gutter, pull to refresh.
 *
 * <p>Exists so the gutter is genuinely the same on every screen. `Spacing`
 * documents `screenHorizontal` as "do not vary it per screen", which holds only
 * as long as screens are not each applying their own padding by hand.
 */
export function MandiScreen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  contentStyle,
  header,
  footer,
  floating,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Pinned above the scroll area — a title bar, a search field. */
  header?: React.ReactNode;
  /** Pinned below it — a checkout summary bar. */
  footer?: React.ReactNode;
  /**
   * Floats over the content — a FAB.
   *
   * <p>A sibling of the scroll view, not a child of it: put inside, "bottom"
   * means the bottom of the content, so on a short list the thing floats in the
   * middle of the screen.
   */
  floating?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  const body = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
              : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {floating}
      {footer}
      {!footer && <View style={{ height: insets.bottom }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  content: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.screenVertical,
    gap: Spacing.sectionGap,
  },
});
