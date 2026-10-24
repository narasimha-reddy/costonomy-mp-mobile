import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiCard, MandiText } from '@/components/common';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

/** A card whose body can be folded away, leaving a one-line summary. */
export function CollapsibleSection({
  title, summary, defaultOpen = false, children,
}: {
  title: string;
  /** Shown beside the title while collapsed. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <MandiCard>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={summary && !open ? `${title}, ${summary}` : title}
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <View style={styles.titles}>
          <MandiText variant="bodyEmphasis">{title}</MandiText>
          {!open && summary ? <MandiText variant="caption" color={Colors.textSecondary}>{summary}</MandiText> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={IconSize.md} color={Colors.textSecondary} />
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TouchTarget.min },
  titles: { flex: 1, gap: 2 },
  body: { marginTop: Spacing.md },
});
