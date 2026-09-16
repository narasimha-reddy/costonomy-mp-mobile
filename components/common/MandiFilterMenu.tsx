import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from './MandiText';
import { MandiBottomSheet } from './MandiBottomSheet';
import { Colors, ControlHeight, Radius, Spacing, TouchTarget } from '@/theme';

export interface FilterOption<T extends string> {
  key: T;
  label: string;
  /** Shown beside the label — a count, usually. */
  hint?: string;
}

/**
 * A filter that sits beside a search field.
 *
 * <p>A row of chips spends a whole line of a 390pt screen on options that are
 * mostly not chosen, and grows unusable the moment there are more than four. A
 * control that states the current choice and opens the rest costs one line
 * shared with search, and says what is active without having to colour anything.
 *
 * <p>The trigger shows the selected label rather than the word "Filter", so the
 * screen is self-describing when the list looks shorter than expected.
 */
export function MandiFilterMenu<T extends string>({
  options,
  selected,
  onSelect,
  title = 'Filter',
}: {
  options: FilterOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((option) => option.key === selected) ?? options[0];
  const narrowed = options.indexOf(active as FilterOption<T>) > 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${active?.label ?? ''}. Change`}
        style={[styles.trigger, narrowed && styles.triggerActive]}
      >
        <Ionicons
          name="funnel-outline"
          size={16}
          color={narrowed ? Colors.primary : Colors.textSecondary}
        />
        <MandiText
          variant="captionEmphasis"
          color={narrowed ? Colors.primary : Colors.textSecondary}
          numberOfLines={1}
        >
          {active?.label}
        </MandiText>
      </Pressable>

      <MandiBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        closeLabel="Close the filter"
      >
        {options.map((option) => {
          const chosen = option.key === selected;
          return (
            <Pressable
              key={option.key}
              onPress={() => {
                onSelect(option.key);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              style={styles.option}
            >
              <MandiText variant="body" style={styles.optionLabel}>{option.label}</MandiText>
              {option.hint != null && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {option.hint}
                </MandiText>
              )}
              {chosen && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
            </Pressable>
          );
        })}
      </MandiBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    height: ControlHeight.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    maxWidth: 150,
  },
  triggerActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
  },
  optionLabel: { flex: 1 },
});
