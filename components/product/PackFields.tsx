import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiFormField, MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * How much is in one pack, and what it is called.
 *
 * <p>Shared by the create form and the editor so the rule cannot be implemented
 * twice and drift. The rule itself lives on the server and arrives with the
 * vocabulary: which units are containers is not a fact this file knows.
 *
 * <p><b>The contents fields appear because the pack unit demands them</b>, not
 * because a checkbox was ticked. "1 PKT" says how goods are bundled and nothing
 * about how much a restaurant is buying, and a form that lets that through has
 * produced a listing nobody can compare.
 */
export function PackFields({
  packSize,
  onPackSize,
  packUnit,
  onPackUnit,
  measureValue,
  onMeasureValue,
  measureUnit,
  onMeasureUnit,
  units,
}: {
  packSize: string;
  onPackSize: (value: string) => void;
  packUnit: string;
  onPackUnit: (value: string) => void;
  measureValue: string;
  onMeasureValue: (value: string) => void;
  measureUnit: string;
  onMeasureUnit: (value: string) => void;
  units: { packUnits: string[]; requiresMeasure: string[]; measureUnits: string[] } | undefined;
}) {
  const packUnits = units?.packUnits ?? [packUnit].filter(Boolean);
  const needsMeasure = units?.requiresMeasure.includes(packUnit) ?? false;
  // A container cannot be measured in itself — "1 PKT of 3 PKT" is a riddle.
  const measureUnits = (units?.measureUnits ?? []).filter((unit) => unit !== packUnit);

  return (
    <View style={styles.block}>
      <MandiFormField
        label="Pack size"
        value={packSize}
        onChangeText={(text) => onPackSize(text.replace(/[^\d.]/g, ''))}
        keyboardType="decimal-pad"
        required
      />

      <UnitChips
        label="Pack unit"
        options={packUnits}
        value={packUnit}
        onChange={onPackUnit}
      />

      {needsMeasure ? (
        <View style={styles.contents}>
          <MandiText variant="label">What is inside one {packUnit}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {/* Stated as the sentence it produces, because the abstract rule —
                "container units require a measure" — is not what a supplier is
                thinking about while typing. */}
            A restaurant sees “{packSize || '1'} {packUnit}
            {measureValue && measureUnit ? ` · ${measureValue} ${measureUnit}` : ''}”.
          </MandiText>

          <MandiFormField
            label="Contents"
            value={measureValue}
            onChangeText={(text) => onMeasureValue(text.replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="500"
            required
          />
          <UnitChips
            label="Contents unit"
            options={measureUnits}
            value={measureUnit}
            onChange={onMeasureUnit}
          />
        </View>
      ) : null}
    </View>
  );
}

function UnitChips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View>
      <MandiText variant="label">{label}</MandiText>
      {/* Wrapped, not scrolled. Fifteen chips in a scroller is more compact and
          hides the selection: PKT sits past the fold, so the supplier who just
          chose it sees a strip where nothing looks chosen. Two or three lines
          that always show the answer beat one line that sometimes does. */}
      <View style={styles.chips}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <MandiText
                variant="captionEmphasis"
                color={active ? Colors.primary : Colors.textSecondary}
              >
                {option}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.md },
  contents: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
