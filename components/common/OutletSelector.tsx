import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOutlet } from '@/contexts/OutletProvider';
import { MandiText } from './MandiText';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

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

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.scrim}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close the outlet list"
        >
          {/* Swallows taps so they do not reach the scrim behind. Marked modal so
              a screen reader stays inside the sheet while it is open. */}
          <Pressable
            style={styles.sheet}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            accessibilityLabel="Choose an outlet"
          >
            <MandiText variant="subtitle" style={styles.sheetTitle}>Choose an outlet</MandiText>
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
          </Pressable>
        </Pressable>
      </Modal>
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
  scrim: { flex: 1, backgroundColor: Colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    maxHeight: '70%',
    gap: Spacing.sm,
  },
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
