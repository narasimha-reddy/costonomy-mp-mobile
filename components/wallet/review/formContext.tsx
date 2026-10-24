import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import {
  InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView,
} from 'react-native';
import { ReviewColors, ReviewLayout, Spacing, TextStyles } from '@/theme';

/** Anything that can be measured against the form's content: a View or a TextInput. */
type Measurable = { measureLayout?: (...args: never[]) => void } | null;

interface FormApi {
  /** Scroll so this field is fully visible above the keyboard and the footer. */
  reveal: (node: Measurable) => void;
  /** Remember the node behind a field key (to focus it, and as a fallback to measure). Null forgets it. */
  register: (key: string, node: Measurable) => void;
  /**
   * An `onLayout` for the View behind `key`, placed inside the View behind `parent` (null: the form's
   * content). The offsets add up to where the field sits in the form, so "scroll to the first error"
   * works from layout events alone, on native and on the web, without measuring anything.
   */
  anchor: (key: string, parent: string | null) => (e: LayoutChangeEvent) => void;
  /** Where the iOS keyboard bar's Next goes while this field has focus. */
  setNext: (next: (() => void) | null) => void;
}

const noop = () => {};
const FormContext = createContext<FormApi>({ reveal: noop, register: noop, anchor: () => noop, setNext: noop });

export const useReviewForm = () => useContext(FormContext);

/** The id of the iOS bar over the number pad (which has no return key of its own). */
export const KEYBOARD_BAR_ID = 'bill-review-keys';

/** Room kept below a revealed field, for the sticky footer and a little air. */
const REVEAL_MARGIN = 96;
/** Room kept above a field scrolled to, so its label shows. */
const SCROLL_TOP_MARGIN = Spacing.xxl * 2;

/**
 * Where a field sits in the form's content, from the offsets its anchors recorded: its own `y` plus each
 * parent's, up to the content. Null when any link in the chain has not been laid out.
 */
export function anchoredY(anchors: Map<string, { parent: string | null; y: number }>, key: string): number | null {
  let y = 0;
  let current: string | null = key;
  for (let depth = 0; current != null; depth++) {
    const a = anchors.get(current);
    if (a == null || depth > 16) return null;
    y += a.y;
    current = a.parent;
  }
  return y;
}

/**
 * The scroll plumbing for a long form: reveal the focused field, scroll to a field by key, and route
 * the keyboard bar's Next. The screen owns the ScrollView and its content View; this keeps the
 * offsets (from onScroll, onLayout and the anchors) without re-rendering anything.
 */
export function useFormScroll() {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  const nodes = useRef(new Map<string, Measurable>());
  const anchors = useRef(new Map<string, { parent: string | null; y: number }>());
  const handlers = useRef(new Map<string, (e: LayoutChangeEvent) => void>());
  const next = useRef<(() => void) | null>(null);
  /** A field asked for before it was laid out (a line just added): scrolled to once its anchors arrive. */
  const pending = useRef<string | null>(null);

  const scrollToY = useCallback((y: number) => {
    scroll.current?.scrollTo({ y: Math.max(0, y - SCROLL_TOP_MARGIN), animated: true });
  }, []);

  const measureTo = useCallback((node: Measurable, onlyIfHidden: boolean) => {
    const target = node as unknown as { measureLayout?: (rel: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail?: () => void) => void };
    if (target?.measureLayout == null || content.current == null) return;
    try {
      target.measureLayout(content.current, (_x, y, _w, h) => {
        const top = offset.current;
        const bottom = top + viewport.current - REVEAL_MARGIN;
        if (onlyIfHidden && y >= top && y + h <= bottom) return;
        scroll.current?.scrollTo({ y: Math.max(0, y - SCROLL_TOP_MARGIN), animated: true });
      }, () => {});
    } catch {
      // Not laid out yet (or a platform without measureLayout): nothing to scroll to.
    }
  }, []);

  const api = useMemo<FormApi>(() => ({
    reveal: (node) => measureTo(node, true),
    register: (key, node) => {
      if (node == null) nodes.current.delete(key);
      else nodes.current.set(key, node);
    },
    anchor: (key, parent) => {
      const id = `${key}\u0000${parent ?? ''}`;
      let handler = handlers.current.get(id);
      if (handler == null) {
        handler = (e: LayoutChangeEvent) => {
          anchors.current.set(key, { parent, y: e.nativeEvent.layout.y });
          if (pending.current != null) {
            const y = anchoredY(anchors.current, pending.current);
            if (y != null) {
              pending.current = null;
              scrollToY(y);
            }
          }
        };
        handlers.current.set(id, handler);
      }
      return handler;
    },
    setNext: (fn) => { next.current = fn; },
  }), [measureTo, scrollToY]);

  /**
   * Scroll so `key` shows near the top, by its anchors; if it has not been laid out yet (a card that is
   * about to appear), as soon as it is. Focus it if it is an input.
   */
  const scrollToKey = useCallback((key: string) => {
    const y = anchoredY(anchors.current, key);
    const node = nodes.current.get(key);
    if (y != null) {
      pending.current = null;
      scrollToY(y);
    } else {
      pending.current = key;
      if (node) measureTo(node, false);
    }
    const focusable = node as unknown as { focus?: () => void; isFocused?: () => boolean } | undefined;
    if (focusable?.focus && focusable.isFocused) focusable.focus();
  }, [measureTo, scrollToY]);

  /** Forget a line's anchors once it is removed. */
  const forget = useCallback((prefix: string) => {
    for (const k of [...anchors.current.keys()]) if (k.startsWith(prefix)) anchors.current.delete(k);
    if (pending.current?.startsWith(prefix)) pending.current = null;
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewport.current = e.nativeEvent.layout.height;
  }, []);
  const goNext = useCallback(() => {
    if (next.current) next.current();
    else Keyboard.dismiss();
  }, []);

  const scrollToTop = useCallback(() => { pending.current = null; scroll.current?.scrollTo({ y: 0, animated: true }); }, []);

  return { scroll, content, api, scrollToKey, scrollToTop, forget, onScroll, onLayout, goNext };
}

export function ReviewFormProvider({ api, children }: { api: FormApi; children: React.ReactNode }) {
  return <FormContext.Provider value={api}>{children}</FormContext.Provider>;
}

/** iOS only: Next and Done over the number pad. Other platforms show the keyboard's own key. */
export function KeyboardBar({ onNext }: { onNext: () => void }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_BAR_ID}>
      <View style={styles.bar}>
        <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="Next field" style={styles.key}>
          <Text style={styles.keyText}>Next</Text>
        </Pressable>
        <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Done, hide the keyboard" style={styles.key}>
          <Text style={[styles.keyText, styles.done]}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: ReviewColors.band,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ReviewColors.divider,
  },
  key: { minHeight: ReviewLayout.tap, minWidth: ReviewLayout.tap, paddingHorizontal: Spacing.md, justifyContent: 'center' },
  keyText: { ...TextStyles.bodyEmphasis, color: ReviewColors.orangeText },
  done: { color: ReviewColors.text },
});
