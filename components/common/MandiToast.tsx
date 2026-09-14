import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Duration, Elevation, IconSize, Radius, Spacing } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MandiText } from './MandiText';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  /**
   * Show a transient message.
   *
   * **Not for confirming a mutation succeeded.** §23A.1 rule 12 and guardrail
   * "never claim order/payment success" mean an order, payment or acceptance is
   * confirmed by navigating to the authoritative state the server returned, not
   * by a toast that appears whether or not the write landed. Use this for
   * reversible, low-stakes feedback: "Copied", "Added to cart", "Saved to drafts".
   */
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: Colors.success, icon: 'checkmark-circle' },
  error: { bg: Colors.danger, icon: 'alert-circle' },
  info: { bg: Colors.textPrimary, icon: 'information-circle' },
};

const VISIBLE_MS = 2600;

/** Mount once, in the root layout, above the navigator. */
export function MandiToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // useState initialiser, not useRef().current — see MandiSkeleton.
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: nextId.current++, message, tone });

      const fade = (toValue: number) =>
        Animated.timing(opacity, {
          toValue,
          duration: reducedMotion ? 0 : Duration.fast,
          useNativeDriver: true,
        });

      fade(1).start();
      timer.current = setTimeout(() => {
        fade(0).start(({ finished }) => {
          if (finished) setToast(null);
        });
      }, VISIBLE_MS);
    },
    [opacity, reducedMotion],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            Elevation.floating,
            { backgroundColor: TONES[toast.tone].bg, bottom: insets.bottom + Spacing.huge, opacity },
          ]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          testID="toast"
        >
          <Ionicons
            name={TONES[toast.tone].icon}
            size={IconSize.md}
            color={Colors.textInverse}
          />
          <MandiText variant="captionEmphasis" color={Colors.textInverse} style={styles.message}>
            {toast.message}
          </MandiText>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <MandiToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.screenHorizontal,
    right: Spacing.screenHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  message: { flex: 1 },
});

export default MandiToastProvider;
