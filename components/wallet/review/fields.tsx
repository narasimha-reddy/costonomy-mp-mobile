import React, { forwardRef, useCallback, useRef, useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, TextInput, View,
  type LayoutChangeEvent, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  deviceDecimalSeparator, groupForDisplay, readNumberInput, toFieldText, type DecimalSeparator,
} from '@/lib/wallet/numberInput';
import { ReviewColors, ReviewLayout, Spacing, TextStyles } from '@/theme';
import { KEYBOARD_BAR_ID, useReviewForm } from './formContext';
import { radioState } from '@/lib/a11y';

/** An input's label, with a red asterisk (and "required" for screen readers) when it must be filled. */
export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.label} accessibilityLabel={required ? `${label}, required` : label}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

/**
 * The line under an input: its error (announced politely), else a hint. The space is always there, so
 * an error appearing never pushes the form down; long text wraps instead of being cut.
 */
export function HelperText({ error, hint, testID }: { error?: string | null; hint?: string | null; testID?: string }) {
  if (error) {
    return (
      <View style={styles.helper} accessibilityLiveRegion="polite" accessibilityRole="alert" testID={testID}>
        <Ionicons name="alert-circle" size={12} color={ReviewColors.error} style={styles.helperIcon} />
        <Text style={[styles.helperText, styles.errorText]}>{error}</Text>
      </View>
    );
  }
  return (
    <View style={styles.helper}>
      {hint ? <Text style={styles.helperText}>{hint}</Text> : null}
    </View>
  );
}

/**
 * A field that opens a picker: the value (or a placeholder), an optional chip, and a chevron.
 * Read as a button that says what it holds: "Supplier, Kosta Delights. Change".
 */
export const SelectField = forwardRef<View, {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  required?: boolean;
  error?: string | null;
  hint?: string | null;
  chip?: React.ReactNode;
  testID?: string;
  hideLabel?: boolean;
  /** The caller draws the error and hint line itself (to put an action beside it). */
  noHelper?: boolean;
  style?: StyleProp<ViewStyle>;
  /** For "scroll to this field" (the form's layout anchors). */
  onLayout?: (e: LayoutChangeEvent) => void;
}>(function SelectField({ label, value, placeholder, onPress, required, error, hint, chip, testID, hideLabel, noHelper, style, onLayout }, ref) {
  return (
    <View style={style} onLayout={onLayout}>
      {!hideLabel && <FieldLabel label={label} required={required} />}
      <Pressable
        ref={ref}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || placeholder}${error ? `, ${error}` : ''}`}
        accessibilityHint="Opens a list to choose from"
        style={({ pressed }) => [styles.select, !!error && styles.invalid, pressed && styles.pressed]}
        testID={testID}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={2}>{value || placeholder}</Text>
        {chip}
        <Ionicons name="chevron-expand" size={16} color={ReviewColors.tertiary} />
      </Pressable>
      {!noHelper && <HelperText error={error} hint={hint} testID={testID ? `${testID}-error` : undefined} />}
    </View>
  );
});

type InputProps = Omit<TextInputProps, 'style'> & {
  invalid?: boolean;
  /** Field key for "scroll to the first error". */
  fieldKey?: string;
  /** Where the keyboard bar's Next goes from here. */
  onNext?: () => void;
  align?: 'left' | 'right' | 'center';
  style?: StyleProp<ViewStyle>;
};

/** A text input on the review form: 44 dp, orange ring on focus, red when invalid, scrolls into view. */
export const ReviewInput = forwardRef<TextInput, InputProps>(function ReviewInput(
  { invalid, fieldKey, onNext, align = 'left', style, onFocus, onBlur, ...rest }, ref,
) {
  const form = useReviewForm();
  const [focused, setFocused] = useState(false);
  const local = useRef<TextInput | null>(null);
  const setRef = useCallback((node: TextInput | null) => {
    local.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
    if (fieldKey) form.register(fieldKey, node);
  }, [ref, fieldKey, form]);

  return (
    <TextInput
      ref={setRef}
      placeholderTextColor={ReviewColors.tertiary}
      onFocus={(e) => {
        setFocused(true);
        form.setNext(onNext ?? null);
        form.reveal(local.current);
        onFocus?.(e);
      }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      aria-invalid={invalid}
      style={[
        styles.input,
        { textAlign: align },
        focused && styles.focused,
        invalid && styles.invalid,
        style as never,
      ]}
      {...rest}
    />
  );
});

/** The phone's decimal separator, read once. */
const DEVICE_SEPARATOR = deviceDecimalSeparator();

/**
 * A number on the form: decimal pad, everything selected on focus so typing replaces it, the keyboard
 * bar (iOS) or the return key moving on to the next field.
 *
 * <p>What is kept of the typing is decided by `readNumberInput`: only the phone's decimal separator is a
 * point; a comma is never read as grouping while typing; pasted grouping is read only when it cannot mean
 * anything else, and the field then says how it read it ("Read as 1,500"). A refused keystroke or paste
 * leaves the value as it was and says why under the field. Grouping is shown only when the field is not
 * being edited. `value` and `onChangeText` always use "." whatever the phone shows.
 */
export const NumberInput = forwardRef<TextInput, Omit<InputProps, 'value' | 'onChangeText'> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  decimals: number;
  maxInt: number;
  /** The phone's separator unless given (tests). */
  separator?: DecimalSeparator;
  /** The style of the View around the input and its message line. */
  containerStyle?: StyleProp<ViewStyle>;
}>(function NumberInput(
  { label, onNext, returnKeyType, value, onChangeText, decimals, maxInt, separator, containerStyle, onFocus, onBlur, testID, ...rest }, ref,
) {
  const sep = separator ?? DEVICE_SEPARATOR;
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const shown = focused ? toFieldText(value, sep) : groupForDisplay(value, sep);

  const change = (text: string) => {
    const read = readNumberInput(text, toFieldText(value, sep), { decimals, maxInt, separator: sep });
    if (!read.ok) {
      setMessage({ text: read.message, error: true });
      return;
    }
    setMessage(read.note ? { text: read.note, error: false } : null);
    if (read.value !== value) onChangeText(read.value);
  };

  return (
    <View style={containerStyle}>
      <ReviewInput
        ref={ref}
        keyboardType="decimal-pad"
        inputMode="decimal"
        selectTextOnFocus
        autoCorrect={false}
        align="right"
        accessibilityLabel={label}
        returnKeyType={returnKeyType ?? (onNext ? 'next' : 'done')}
        submitBehavior={onNext ? 'submit' : 'blurAndSubmit'}
        onSubmitEditing={onNext}
        onNext={onNext}
        inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_BAR_ID : undefined}
        value={shown}
        onChangeText={change}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => {
          setFocused(false);
          setMessage((m) => (m?.error ? null : m));
          onBlur?.(e);
        }}
        testID={testID}
        {...rest}
      />
      {message ? (
        <Text
          style={[styles.inputNote, message.error && styles.errorText]}
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-note` : undefined}
        >
          {message.text}
        </Text>
      ) : null}
    </View>
  );
});

/** A two-way choice (Pending / Completed), read as radio buttons. */
export function Segmented<T extends string>({
  label, options, value, onChange, testID,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented} testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={radioState(on)}
            accessibilityLabel={o.label}
            style={[styles.segment, on && styles.segmentOn]}
            testID={testID ? `${testID}-${o.value}` : undefined}
          >
            {on ? <Ionicons name="checkmark" size={16} color={ReviewColors.orange} /> : null}
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small chip: Resolved, Needs attention, New, Reviewed. Icon plus words, never colour alone. */
export function Chip({
  label, tone, icon, testID, hidden = false,
}: {
  label: string;
  tone: 'resolved' | 'attention' | 'new' | 'neutral';
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  /** The words are already read out elsewhere (a line card's header): skip it as a stop of its own. */
  hidden?: boolean;
}) {
  const palette = {
    resolved: { bg: ReviewColors.resolvedChip, fg: ReviewColors.resolvedText, icon: 'checkmark' as const },
    attention: { bg: ReviewColors.attentionChip, fg: ReviewColors.attentionText, icon: 'alert-circle-outline' as const },
    new: { bg: ReviewColors.newChip, fg: ReviewColors.newText, icon: 'add-circle-outline' as const },
    neutral: { bg: ReviewColors.band, fg: ReviewColors.secondaryOnBand, icon: 'create-outline' as const },
  }[tone];
  return (
    <View
      style={[styles.chip, { backgroundColor: palette.bg }]}
      accessible={!hidden}
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID={testID}
    >
      <Ionicons name={icon ?? palette.icon} size={12} color={palette.fg} />
      <Text style={[styles.chipText, { color: palette.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...TextStyles.captionEmphasis, color: ReviewColors.secondary, marginBottom: Spacing.xs },
  required: { color: ReviewColors.required },
  helper: { minHeight: ReviewLayout.helperHeight, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, paddingTop: 2 },
  helperIcon: { marginTop: 2 },
  helperText: { ...TextStyles.label, letterSpacing: 0, color: ReviewColors.secondary, flexShrink: 1 },
  inputNote: { ...TextStyles.label, letterSpacing: 0, color: ReviewColors.secondary, paddingTop: 2, textAlign: 'right' },
  errorText: { color: ReviewColors.error },
  select: {
    minHeight: ReviewLayout.fieldHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.fieldRadius,
    backgroundColor: ReviewColors.field,
  },
  pressed: { backgroundColor: ReviewColors.band },
  value: { ...TextStyles.body, color: ReviewColors.text, flex: 1 },
  placeholder: { color: ReviewColors.tertiary },
  input: {
    ...TextStyles.body,
    color: ReviewColors.text,
    minWidth: 0,
    minHeight: ReviewLayout.fieldHeight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm + 2 : Spacing.sm,
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.fieldRadius,
    backgroundColor: ReviewColors.field,
  },
  focused: { borderColor: ReviewColors.fieldFocus, borderWidth: 1.5 },
  invalid: { borderColor: ReviewColors.errorBorder, borderWidth: 1.5 },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.fieldRadius,
    padding: 2,
    gap: 2,
    backgroundColor: ReviewColors.band,
  },
  segment: {
    flex: 1,
    minHeight: ReviewLayout.fieldHeight - 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: ReviewLayout.fieldRadius - 2,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentOn: { backgroundColor: ReviewColors.card, borderWidth: 1.5, borderColor: ReviewColors.orange },
  segmentText: { ...TextStyles.body, color: ReviewColors.secondaryOnBand },
  segmentTextOn: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  chipText: { ...TextStyles.label, letterSpacing: 0 },
});
