import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiSkeleton } from '@/components/common/MandiSkeleton';
import { DetailColors, DetailLayout } from '@/theme';

/** The card's shape in grey blocks while the detail loads: label, avatar row, details, actions. */
export function DetailSkeleton() {
  return (
    <View style={styles.card} testID="detail-skeleton" accessibilityLabel="Loading transaction">
      <MandiSkeleton width={90} height={12} />
      <View style={styles.payee}>
        <MandiSkeleton width={DetailLayout.avatar} height={DetailLayout.avatar} radius={DetailLayout.avatarRadius} />
        <View style={styles.names}>
          <MandiSkeleton width="60%" height={14} />
          <MandiSkeleton width="40%" height={11} style={styles.gap} />
        </View>
        <MandiSkeleton width={56} height={14} />
      </View>
      <View style={styles.divider} />
      <MandiSkeleton width={120} height={14} style={styles.section} />
      <MandiSkeleton width={140} height={10} style={styles.gap} />
      <MandiSkeleton width={50} height={12} style={styles.gap} />
      <MandiSkeleton width="55%" height={14} style={styles.gap} />
      <View style={styles.actions}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.action}>
            <MandiSkeleton width={DetailLayout.circle} height={DetailLayout.circle} radius={DetailLayout.circle / 2} />
            <MandiSkeleton width={48} height={10} style={styles.gap} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: DetailLayout.cardMargin,
    marginTop: DetailLayout.cardTop,
    paddingHorizontal: DetailLayout.cardInset,
    paddingVertical: DetailLayout.cardPadTop + 4,
    borderRadius: DetailLayout.cardRadius,
    backgroundColor: DetailColors.card,
  },
  payee: { flexDirection: 'row', alignItems: 'center', marginTop: DetailLayout.titleToAvatar },
  names: { flex: 1, marginHorizontal: DetailLayout.textGap },
  gap: { marginTop: 8 },
  divider: { height: 1, marginTop: DetailLayout.dividerTop, backgroundColor: DetailColors.divider },
  section: { marginTop: 18 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 26 },
  action: { alignItems: 'center' },
});
