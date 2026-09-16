import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/contexts/StoreProvider';
import { MandiBottomSheet, MandiText } from '@/components/common';
import { Colors, Spacing, TouchTarget } from '@/theme';

/** The store switcher. A single-store supplier sees a label, not a control. */
export function StoreSelector() {
  const { store, stores, select } = useStore();
  const [open, setOpen] = useState(false);

  if (!store) return null;
  const single = stores.length <= 1;

  return (
    <>
      <Pressable
        onPress={() => !single && setOpen(true)}
        disabled={single}
        accessibilityRole={single ? 'text' : 'button'}
        accessibilityLabel={single ? `Store ${store.name}` : `Store ${store.name}. Change store`}
        style={styles.trigger}
      >
        <Ionicons name="storefront-outline" size={16} color={Colors.textSecondary} />
        <MandiText variant="captionEmphasis" numberOfLines={1} style={styles.name}>
          {store.name}
        </MandiText>
        {!single && <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />}
      </Pressable>

      <MandiBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Choose a store"
        closeLabel="Close the store list"
      >
            <ScrollView>
              {stores.map((option) => {
                const active = option.id === store.id;
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
  trigger: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: TouchTarget.min },
  name: { maxWidth: 180 },
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
