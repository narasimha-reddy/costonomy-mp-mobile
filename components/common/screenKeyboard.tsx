import { createContext, useCallback, useContext, useRef } from 'react';
import type { View } from 'react-native';

/** Breathing room kept between a revealed field and the edge of the visible area, in dp. */
export const FIELD_MARGIN = 16;

/**
 * Where the scroll view must go so a focused field is fully visible above the keyboard.
 *
 * <p>Pure so it can be tested without a device. `viewport` is the scroll view's current
 * height, `baseViewport` its height with the keyboard closed and `keyboard` the keyboard's
 * height: the visible area is the smaller of the real viewport and what the keyboard
 * leaves, because the lift (KeyboardAvoidingView padding) lands a frame after the focus.
 * Returns null when the field is already inside it.
 */
export function fieldScrollTarget({
  fieldY, fieldHeight, scrollY, viewport, baseViewport, keyboard,
}: {
  fieldY: number;
  fieldHeight: number;
  scrollY: number;
  viewport: number;
  baseViewport: number;
  keyboard: number;
}): number | null {
  const visible = keyboard > 0 && baseViewport > 0 ? Math.min(viewport, baseViewport - keyboard) : viewport;
  if (visible <= 0) return null;
  const bottom = fieldY + fieldHeight + FIELD_MARGIN;
  if (bottom > scrollY + visible) return Math.max(0, bottom - visible);
  if (fieldY - FIELD_MARGIN < scrollY) return Math.max(0, fieldY - FIELD_MARGIN);
  return null;
}

/** Given by `MandiScreen avoidKeyboard`: reveal a field's wrapper view above the keyboard. */
export interface ScreenScroll {
  reveal: (field: View | null) => void;
}

export const ScreenScrollContext = createContext<ScreenScroll | null>(null);

/** True while the soft keyboard is up, inside a `MandiScreen avoidKeyboard`. */
export const KeyboardOpenContext = createContext(false);

/**
 * For a field that is not a `MandiFormField` (which already does this itself): put `ref`
 * on a view wrapping the input and `onFocus` on the input. Outside an avoiding screen it
 * does nothing.
 */
export function useScrollFieldIntoView() {
  const screen = useContext(ScreenScrollContext);
  const ref = useRef<View>(null);
  const onFocus = useCallback(() => { screen?.reveal(ref.current); }, [screen]);
  return { ref, onFocus };
}
