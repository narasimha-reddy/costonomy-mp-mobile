// Accessibility state for a role="radio" row. Radios expose `checked` (and
// `disabled`); `selected` is invalid on role=radio (react-native-web renders
// aria-selected) and makes TalkBack announce "selected, checked" twice.
export function radioState(active: boolean, disabled?: boolean): { checked: boolean; disabled?: boolean } {
  return disabled === undefined ? { checked: active } : { checked: active, disabled };
}

/**
 * Everything a role="radio" row spreads: `{...radioProps(active)}`.
 *
 * <p>react-native-web does not turn accessibilityState.checked into aria-checked for role=radio (the web read
 * aria-checked=null), so the row also carries aria-checked itself, and aria-disabled when a disabled state is given.
 * On native, React Native folds aria-checked into the same accessibilityState, so the two never disagree.
 */
export function radioProps(active: boolean, disabled?: boolean): {
  accessibilityState: { checked: boolean; disabled?: boolean };
  'aria-checked': boolean;
  'aria-disabled'?: boolean;
} {
  return {
    accessibilityState: radioState(active, disabled),
    'aria-checked': active,
    ...(disabled !== undefined ? { 'aria-disabled': disabled } : {}),
  };
}
