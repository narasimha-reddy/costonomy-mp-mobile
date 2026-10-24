import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * The one banner for chilled goods, drawn from theme tokens (it was three hard-coded copies, each with its own hex
 * values and its own claim about vehicles). Says only what the API guarantees (D-134): chilled goods are carried
 * only by a carrier verified for them, or by the supplier or the restaurant.
 */
export function ColdChainBanner({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: compact ? undefined : Colors.coldChainLight,
        paddingHorizontal: compact ? 0 : Spacing.sm,
        paddingVertical: compact ? 0 : Spacing.xs,
        borderRadius: Radius.sm,
      }}
    >
      <Ionicons name="snow" size={compact ? 12 : 16} color={Colors.coldChain} />
      <MandiText variant={compact ? 'caption' : 'captionEmphasis'} color={Colors.coldChain} style={{ flex: 1 }}>
        {text}
      </MandiText>
    </View>
  );
}
