import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiMoreBelow, useMoreBelow } from './MandiMoreBelow';
import {
  KeyboardOpenContext,
  ScreenScrollContext,
  fieldScrollTarget,
  type ScreenScroll,
} from './screenKeyboard';
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
  avoidKeyboard = false,
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
  /**
   * For a screen with inputs. Wraps the content AND the footer in a
   * KeyboardAvoidingView (padding on both platforms: with edge-to-edge Android the
   * window no longer resizes itself), so the footer button sits directly above the
   * keyboard; scrolls a focused `MandiFormField` (or any field using
   * `useScrollFieldIntoView`) into view above it; and hides the `moreBelow` cue
   * while the keyboard is up. Taps persist and a drag dismisses the keyboard.
   */
  avoidKeyboard?: boolean;
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
  const { keyboard, scrollRef, scrollProps, screenScroll } = useKeyboardScroll(avoidKeyboard);

  const body = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  const keyboardOpen = avoidKeyboard && keyboard > 0;
  const showCue = scroll && moreBelow != null && !keyboardOpen;

  const root = (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={
            stickyIndices != null
              ? [styles.scroll, styles.content, contentStyle]
              : styles.scroll
          }
          stickyHeaderIndices={stickyIndices}
          testID="mandi-screen-scroll"
          {...(moreBelow != null ? more.scrollProps : null)}
          {...(avoidKeyboard ? { ...scrollProps, onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollProps.onScroll(e);
            if (moreBelow != null) more.scrollProps.onScroll(e);
          }, onLayout: (e: LayoutChangeEvent) => {
            scrollProps.onLayout(e);
            if (moreBelow != null) more.scrollProps.onLayout(e);
          }, scrollEventThrottle: 16, keyboardDismissMode: 'on-drag' as const } : null)}
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
      {showCue && moreBelow != null && <MandiMoreBelow visible={more.visible} label={moreBelow} />}
      {floating}
      {footer}
      {!footer && <View style={{ height: keyboardOpen ? 0 : insets.bottom }} />}
    </View>
  );

  if (!avoidKeyboard) return root;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" testID="mandi-screen-keyboard-avoiding">
      <ScreenScrollContext.Provider value={screenScroll}>
        <KeyboardOpenContext.Provider value={keyboardOpen}>{root}</KeyboardOpenContext.Provider>
      </ScreenScrollContext.Provider>
    </KeyboardAvoidingView>
  );
}

/**
 * The keyboard half of `avoidKeyboard`: the keyboard's height, the scroll view's ref,
 * and `reveal`, which scrolls a focused field above the keyboard. The focus event
 * arrives before the keyboard (and so before the lift shrinks the scroll view), so a
 * reveal asked for while it is closed waits for the keyboard or the new viewport.
 */
function useKeyboardScroll(enabled: boolean) {
  const scrollRef = useRef<ScrollView>(null);
  const [keyboard, setKeyboard] = useState(0);
  const keyboardRef = useRef(0);
  const scrollY = useRef(0);
  const viewport = useRef(0);
  const baseViewport = useRef(0);
  const pending = useRef<View | null>(null);

  const flush = useCallback(() => {
    const field = pending.current;
    const scroll = scrollRef.current;
    if (field == null || scroll == null || keyboardRef.current <= 0) return;
    const inner = (scroll as unknown as { getInnerViewRef?: () => unknown }).getInnerViewRef?.();
    if (inner == null) return;
    // `measureLayout` takes a native component; the inner content view is one.
    (field as unknown as {
      measureLayout: (to: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail: () => void) => void;
    }).measureLayout(inner, (_x, y, _w, h) => {
      const target = fieldScrollTarget({
        fieldY: y,
        fieldHeight: h,
        scrollY: scrollY.current,
        viewport: viewport.current,
        baseViewport: baseViewport.current,
        keyboard: keyboardRef.current,
      });
      if (target != null) scroll.scrollTo({ y: target, animated: true });
    }, () => {});
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const subs = [
      Keyboard.addListener('keyboardDidShow', (e) => {
        keyboardRef.current = e.endCoordinates?.height ?? 0;
        setKeyboard(keyboardRef.current);
        flush();
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardRef.current = 0;
        pending.current = null;
        setKeyboard(0);
      }),
    ];
    if (Platform.OS === 'ios') {
      subs.push(Keyboard.addListener('keyboardWillHide', () => { setKeyboard(0); }));
    }
    return () => subs.forEach((s) => s.remove());
  }, [enabled, flush]);

  const reveal = useCallback((field: View | null) => {
    pending.current = field;
    flush();
  }, [flush]);
  const screenScroll = useMemo<ScreenScroll>(() => ({ reveal }), [reveal]);

  const scrollProps = {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y; },
    onLayout: (e: LayoutChangeEvent) => {
      viewport.current = e.nativeEvent.layout.height;
      if (keyboardRef.current <= 0) baseViewport.current = viewport.current;
      flush();
    },
  };
  return { keyboard, scrollRef, scrollProps, screenScroll };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  content: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.screenVertical,
    gap: Spacing.sectionGap,
  },
});
