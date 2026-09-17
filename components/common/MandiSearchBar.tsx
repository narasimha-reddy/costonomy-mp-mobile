import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  ControlHeight,
  IconSize,
  Radius,
  Spacing,
  TextStyles,
  hitSlopFor,
} from '@/theme';

interface MandiSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  /** Spinner in the trailing slot while suggestions are in flight. */
  loading?: boolean;
  autoFocus?: boolean;
  /**
   * Renders as a non-editable button that navigates to the search screen.
   * Home (§23A.9) uses this; the search screen itself uses the editable form.
   */
  readOnly?: boolean;
  onPress?: () => void;
  /**
   * Rendered inside the field, before the search glyph.
   *
   * <p>The search screen puts its back button here rather than beside the field:
   * on a screen that is nothing but a search, two separate targets at the top
   * read as two controls of equal weight, and the field is not one of two things.
   */
  leading?: React.ReactNode;
  /** Fully rounded and taller — the search screen's own field. */
  pill?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Product search. PRD §23A.3, §23A.10.
 *
 * Debouncing and stale-response cancellation are the *caller's* job — they
 * belong with the query, not the input (see `useDebouncedValue` and TanStack
 * Query's built-in request deduplication). §23A.10 requires both.
 */
export function MandiSearchBar({
  value,
  onChangeText,
  placeholder = 'Search for products',
  onSubmit,
  loading = false,
  autoFocus = false,
  readOnly = false,
  onPress,
  leading,
  pill = false,
  style,
  testID,
}: MandiSearchBarProps) {
  const body = (
    <View style={[styles.container, pill && styles.pill, style]}>
      {leading}
      <Ionicons name="search" size={IconSize.md} color={Colors.textTertiary} />

      {readOnly ? (
        <View style={styles.readOnlyText}>
          <Text
            numberOfLines={1}
            style={[styles.input, !value && { color: Colors.textTertiary }]}
          >
            {value || placeholder}
          </Text>
        </View>
      ) : (
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          onSubmitEditing={onSubmit}
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={placeholder}
          style={styles.input}
        />
      )}

      {loading && <ActivityIndicator size="small" color={Colors.textTertiary} />}

      {!loading && !readOnly && value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={hitSlopFor(IconSize.md)}
        >
          <Ionicons name="close-circle" size={IconSize.md} color={Colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );

  if (readOnly && onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
      >
        {body}
      </Pressable>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: ControlHeight.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.md,
  },
  pill: {
    height: ControlHeight.lg,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    ...TextStyles.body,
    color: Colors.textPrimary,
    // Android's TextInput adds vertical padding that breaks the fixed height.
    paddingVertical: 0,
  },
  readOnlyText: { flex: 1, justifyContent: 'center' },
});

export default MandiSearchBar;
