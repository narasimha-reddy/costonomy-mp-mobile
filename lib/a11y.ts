// Accessibility state for a role="radio" row. Radios expose `checked` (and
// `disabled`); `selected` is invalid on role=radio (react-native-web renders
// aria-selected) and makes TalkBack announce "selected, checked" twice.
export function radioState(active: boolean, disabled?: boolean): { checked: boolean; disabled?: boolean } {
  return disabled === undefined ? { checked: active } : { checked: active, disabled };
}
