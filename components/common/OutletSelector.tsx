import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOutlet } from '@/contexts/OutletProvider';
import { MandiText } from './MandiText';
import { MandiBottomSheet } from './MandiBottomSheet';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * The globally accessible outlet switcher (doc 05 §1).
 *
 * <p>A single-outlet restaurant sees a plain label, not a control: most
 * restaurants have one outlet, and a picker that only ever has one answer is
 * noise on the most-visited screen in the app.
 */
export function OutletSelector() {
  const { outlet, outlets, select } = useOutlet();
  const [open, setOpen] = useState(false);

  if (!outlet) return null;

  const single = outlets.length <= 1;

  return (
    <>
      <Pressable
        onPress={() => !single && setOpen(true)}
        disabled={single}
        accessibilityRole={single ? 'text' : 'button'}
        accessibilityLabel={
          single ? `Outlet ${outlet.name}` : `Outlet ${outlet.name}. Change outlet`
        }
        style={styles.trigger}
      >
        <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
        <MandiText variant="captionEmphasis" numberOfLines={1} style={styles.name}>
          {outlet.name}
        </MandiText>
        {!single && <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />}
      </Pressable>

      <MandiBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Choose an outlet"
        closeLabel="Close the outlet list"
      >
            <ScrollView>
              {outlets.map((option) => {
                const active = option.id === outlet.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      select(option.id);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={styles.option}
                  >
                    <View style={styles.optionText}>
                      <MandiText variant="bodyEmphasis">{option.name}</MandiText>
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {[option.addressLine1, option.city].filter(Boolean).join(', ')}
                      </MandiText>
                    </View>
                    {active && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
      </MandiBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TouchTarget.min,
  },
  name: { maxWidth: 200 },
  sheetTitle: { marginBottom: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    minHeight: TouchTarget.min,
  },
  optionText: { flex: 1, gap: Spacing.xs },
});
