import React from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  ControlHeight,
  IconSize,
  Radius,
  Spacing,
  TextStyles,
  hitSlopFor,
} from '@/theme';
import { MandiText } from './MandiText';

interface MandiQuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /**
   * Doc 01 §7 and PRD §9: **no MOQ and no order increments initially.** So min
   * defaults to 0 and step to 1, and neither should be used to invent a minimum
   * the backend does not enforce. A supplier's own-delivery minimum *order value*
   * is a separate, order-level rule — it is not a per-line quantity floor.
   */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Allows typing a quantity directly. Off for compact card-level steppers. */
  editable?: boolean;
  disabled?: boolean;
  /**
   * Show the quantity in the same frame, with no controls.
   *
   * <p>Not the same as `disabled`, which greys out controls that are still
   * there. This removes them, so a quantity reads identically whether or not it
   * happens to be editable right now — the row does not reflow when an Edit
   * button is pressed, and the eye does not have to re-find the number.
   */
  readOnly?: boolean;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  testID?: string;
  /** Names the thing being counted, e.g. "Paneer 1 kg". Used for a11y labels. */
  itemLabel?: string;
}

/** PRD §23A.3. Used on product detail, cart, partial acceptance and receiving. */
export function MandiQuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  editable = false,
  disabled = false,
  readOnly = false,
  size = 'md',
  style,
  testID,
  itemLabel,
}: MandiQuantityStepperProps) {
  const canDecrease = !disabled && !readOnly && value > min;
  const canIncrease = !disabled && !readOnly && (max == null || value < max);
  const height = size === 'sm' ? ControlHeight.sm : ControlHeight.md;
  const glyph = size === 'sm' ? IconSize.sm : IconSize.md;
  const suffix = itemLabel ? ` ${itemLabel}` : '';

  const clamp = (next: number) => {
    if (next < min) return min;
    if (max != null && next > max) return max;
    return next;
  };

  return (
    <View style={[styles.container, { height }, style]} testID={testID}>
      {!readOnly && (
      <Pressable
        onPress={canDecrease ? () => onChange(clamp(value - step)) : undefined}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel={`Decrease quantity${suffix}`}
        accessibilityState={{ disabled: !canDecrease }}
        hitSlop={hitSlopFor(glyph)}
        style={styles.control}
      >
        <Ionicons
          name="remove"
          size={glyph}
          color={canDecrease ? Colors.primary : Colors.textDisabled}
        />
      </Pressable>
      )}

      {editable && !readOnly ? (
        <TextInput
          value={String(value)}
          onChangeText={(text) => {
            const parsed = Number(text.replace(/[^0-9.]/g, ''));
            onChange(Number.isFinite(parsed) ? clamp(parsed) : min);
          }}
          keyboardType="decimal-pad"
          editable={!disabled}
          selectTextOnFocus
          accessibilityLabel={`Quantity${suffix}`}
          style={styles.input}
        />
      ) : (
        <MandiText
          variant="numeric"
          center
          style={styles.value}
          // Announced as one phrase — "3 KG" — rather than a bare digit.
          accessibilityLabel={`${value}${unit ? ` ${unit}` : ''}${suffix}`}
        >
          {value}
        </MandiText>
      )}

      {unit != null && (
        <MandiText variant="caption" muted style={styles.unit}>
          {unit}
        </MandiText>
      )}

      {!readOnly && (
      <Pressable
        onPress={canIncrease ? () => onChange(clamp(value + step)) : undefined}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel={`Increase quantity${suffix}`}
        accessibilityState={{ disabled: !canIncrease }}
        hitSlop={hitSlopFor(glyph)}
        style={styles.control}
      >
        <Ionicons
          name="add"
          size={glyph}
          color={canIncrease ? Colors.primary : Colors.textDisabled}
        />
      </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  control: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  value: { minWidth: 32 },
  input: {
    minWidth: 44,
    textAlign: 'center',
    ...TextStyles.numeric,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  unit: { marginRight: Spacing.xs },
});

export default MandiQuantityStepper;
