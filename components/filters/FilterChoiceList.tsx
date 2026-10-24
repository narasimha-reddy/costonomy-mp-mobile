import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common/MandiText';
import { Colors, IconSize, Spacing } from '@/theme';

export interface FilterChoice { value: string; label: string; disabled?: boolean }
/** A caption between groups of choices in one section. */
export interface FilterHeading { heading: string }

/** A checkbox row per choice; the rows' testIDs are `choice-<value>`. */
export function FilterChoiceList({
  items, chosen, onToggle,
}: {
  items: (FilterChoice | FilterHeading)[];
  chosen: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.list}>
      {items.map((choice) => {
        if ('heading' in choice) {
          return (
            <MandiText
              key={`heading-${choice.heading}`}
              variant="captionEmphasis"
              color={Colors.textSecondary}
              style={styles.heading}
              accessibilityRole="header"
            >
              {choice.heading}
            </MandiText>
          );
        }
        const ticked = chosen.includes(choice.value);
        return (
          <Pressable
            key={choice.value}
            testID={`choice-${choice.value}`}
            disabled={choice.disabled}
            onPress={() => onToggle(choice.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ticked, disabled: choice.disabled === true }}
            style={styles.choice}
          >
            <Ionicons
              name={ticked ? 'checkbox' : 'square-outline'}
              size={IconSize.lg}
              color={choice.disabled ? Colors.textDisabled : ticked ? Colors.primary : Colors.textTertiary}
            />
            <MandiText
              variant="body"
              color={choice.disabled ? Colors.textTertiary : Colors.textPrimary}
              style={styles.flex}
            >
              {choice.label}
            </MandiText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  heading: { paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 48,
  },
});
