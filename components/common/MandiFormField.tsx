import React from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ControlHeight, IconSize, Radius, Spacing, TextStyles } from '@/theme';
import { MandiText } from './MandiText';

interface MandiFormFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /**
   * An error from the **server**. Validation is server-authoritative throughout
   * (§23A.8, doc 05 §35) — the client may pre-check format to save a round trip,
   * but the message shown here should be the backend's verdict on submit.
   */
  error?: string | null;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  maxLength?: number;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  /** e.g. "+91" on a phone field. */
  prefix?: string;
  style?: ViewStyle;
  testID?: string;
}

/** A labelled text input with hint and error slots. PRD §23A.3. */
export function MandiFormField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  required = false,
  disabled = false,
  multiline = false,
  keyboardType,
  autoCapitalize = 'sentences',
  secureTextEntry = false,
  maxLength,
  leadingIcon,
  prefix,
  style,
  testID,
}: MandiFormFieldProps) {
  const invalid = error != null && error !== '';

  return (
    <View style={[styles.field, style]}>
      <MandiText variant="captionEmphasis" muted>
        {label}
        {required && <MandiText variant="captionEmphasis" color={Colors.danger}> *</MandiText>}
      </MandiText>

      <View
        style={[
          styles.inputRow,
          multiline && styles.multilineRow,
          invalid && styles.invalid,
          disabled && styles.disabled,
        ]}
      >
        {leadingIcon && (
          <Ionicons name={leadingIcon} size={IconSize.md} color={Colors.textTertiary} />
        )}
        {prefix != null && (
          <MandiText variant="body" muted>
            {prefix}
          </MandiText>
        )}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          editable={!disabled}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          accessibilityLabel={label}
          accessibilityHint={hint}
          // Screen readers announce the field as invalid rather than relying on
          // the red border, which §23A.48 rules out as a colour-only signal.
          accessibilityState={{ disabled }}
          aria-invalid={invalid}
          style={[styles.input, multiline && styles.multilineInput]}
        />
      </View>

      {invalid ? (
        <View style={styles.messageRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={IconSize.xs} color={Colors.danger} />
          <MandiText variant="caption" color={Colors.danger}>
            {error}
          </MandiText>
        </View>
      ) : hint != null ? (
        <MandiText variant="caption" color={Colors.textTertiary}>
          {hint}
        </MandiText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: ControlHeight.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  multilineRow: { minHeight: 96, alignItems: 'flex-start', paddingVertical: Spacing.md },
  invalid: { borderColor: Colors.danger },
  disabled: { backgroundColor: Colors.surfaceSunken },
  input: {
    flex: 1,
    ...TextStyles.body,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  multilineInput: { textAlignVertical: 'top', minHeight: 72 },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});

export default MandiFormField;
