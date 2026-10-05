import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiMoreBelow, useMoreBelow } from './MandiMoreBelow';
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
  stickyIndices,
  moreBelow,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /**
   * Which children pin to the top as the content scrolls past them.
   *
   * <p>Indices into `children`, which is why passing this changes the shape of
   * the tree: the wrapper `View` the gutter normally lives on would be the one
   * and only child, so the padding moves onto the scroll view's content
   * container and the children become its direct descendants. Nothing else
   * about the screen changes.
   *
   * <p>For a list whose groups are long enough to lose their heading — the
   * cart's suppliers. A group whose heading has scrolled away is a list of
   * prices with nobody's name on it.
   */
  stickyIndices?: number[];
  /**
   * Shows this line (with a down arrow) just above the footer while the content
   * is taller than the screen and not yet scrolled to the end. For a form whose
   * primary button sits in the footer and whose last fields are below the fold.
   */
  moreBelow?: string;
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
  const more = useMoreBelow();

  const body = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={
            stickyIndices != null
              ? [styles.scroll, styles.content, contentStyle]
              : styles.scroll
          }
          stickyHeaderIndices={stickyIndices}
          testID="mandi-screen-scroll"
          {...(moreBelow != null ? more.scrollProps : null)}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
              : undefined
          }
        >
          {stickyIndices != null ? children : body}
        </ScrollView>
      ) : (
        body
      )}
      {scroll && moreBelow != null && <MandiMoreBelow visible={more.visible} label={moreBelow} />}
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
