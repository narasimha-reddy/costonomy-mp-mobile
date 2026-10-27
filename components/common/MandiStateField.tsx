import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchStates, matchingStates, stateCodeFor } from '@/lib/geo/states';
import { MandiFormField } from './MandiFormField';
import { FilterPills } from './FilterPills';

/** The cache entry for common's state list, shared by every state field. */
export const GEO_STATES_KEY = ['geo', 'states'] as const;

/**
 * A state, typed or picked by name.
 *
 * <p>costonomy-common-api stores an outlet's state as its ISO code, and refuses a marketplace outlet without one. The
 * field shows names, offers the states that match what was typed, and says so when what is there is not a state —
 * so a typo is caught here rather than sent as a different state. The services convert the name to the code.
 */
export function MandiStateField({
  value,
  onChangeText,
  disabled = false,
  required = false,
  placeholder = 'Karnataka',
  style,
}: {
  value: string;
  onChangeText: (name: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  style?: ViewStyle;
}) {
  const states = useQuery({ queryKey: GEO_STATES_KEY, queryFn: fetchStates, staleTime: Infinity });
  const list = states.data ?? [];
  const known = stateCodeFor(list, value) != null;
  const suggestions = disabled || known ? [] : matchingStates(list, value);
  const unknown = !disabled && value.trim().length > 1 && list.length > 0 && !known && suggestions.length === 0;

  return (
    <View style={style}>
      <MandiFormField
        label="State"
        value={value}
        onChangeText={onChangeText}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoCapitalize="words"
        error={unknown ? 'That is not a state we know. Check the spelling.' : undefined}
        hint={states.isError ? 'We could not load the list of states. Check your connection.' : undefined}
      />
      {suggestions.length > 0 ? (
        <FilterPills
          items={suggestions.map((s) => ({ key: s.code, label: s.name }))}
          selected=""
          onSelect={(code) => onChangeText(list.find((s) => s.code === code)?.name ?? value)}
        />
      ) : null}
    </View>
  );
}

/** Whether a typed state is one of common's, for a screen's "can continue" check. */
export function useStateIsKnown(value: string): boolean {
  const states = useQuery({ queryKey: GEO_STATES_KEY, queryFn: fetchStates, staleTime: Infinity });
  return stateCodeFor(states.data ?? [], value) != null;
}
