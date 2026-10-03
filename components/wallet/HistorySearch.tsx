import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WalletColors, WalletLayout, WalletType } from '@/theme';

/**
 * History's search field: an orange-tinted pill, search glyph, the word "Search", then a thin
 * rule and the filter glyph. `activeFilters` puts a small dot on the filter glyph so a narrowed
 * list is not mistaken for the whole history.
 */
export function HistorySearch({
  value, onChangeText, onOpenFilters, activeFilters = 0,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onOpenFilters: () => void;
  activeFilters?: number;
}) {
  return (
    <View style={styles.field} testID="history-search">
      <Ionicons name="search-outline" size={WalletLayout.searchIcon} color={WalletColors.ink} />
      <TextInput
        testID="history-search-input"
        value={value}
        onChangeText={onChangeText}
        placeholder="Search"
        placeholderTextColor={WalletColors.placeholder}
        accessibilityLabel="Search your wallet history"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {value !== '' && (
        <Pressable
          testID="history-search-clear"
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={12}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={WalletLayout.searchIcon - 4} color={WalletColors.placeholder} />
        </Pressable>
      )}
      <View style={styles.separator} />
      <Pressable
        testID="open-filters"
        onPress={onOpenFilters}
        accessibilityRole="button"
        accessibilityLabel={activeFilters > 0 ? `Filters, ${activeFilters} applied` : 'Filters'}
        hitSlop={12}
      >
        <Ionicons name="options-outline" size={WalletLayout.searchIcon} color={WalletColors.ink} />
        {activeFilters > 0 && <View style={styles.dot} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: WalletLayout.searchHeight,
    marginHorizontal: WalletLayout.searchMargin,
    paddingLeft: WalletLayout.searchPadLeft,
    paddingRight: WalletLayout.searchPadRight,
    borderRadius: WalletLayout.searchRadius,
    backgroundColor: WalletColors.orangeTint,
  },
  input: {
    ...WalletType.search,
    flex: 1,
    marginLeft: WalletLayout.searchIconGap,
    paddingVertical: 0,
    color: WalletColors.ink,
    // The web build draws a focus ring around the input; the pill is the field.
    outlineStyle: 'none',
  } as object,
  clear: { marginRight: 8 },
  separator: {
    width: 1,
    height: WalletLayout.searchSeparatorHeight,
    marginRight: WalletLayout.searchSeparatorGap,
    backgroundColor: WalletColors.searchSeparator,
  },
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: WalletColors.orange,
  },
});
