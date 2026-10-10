import { radioProps, radioState } from '@/lib/a11y';

describe('radioState', () => {
  it('exposes checked and never selected', () => {
    expect(radioState(true)).toEqual({ checked: true });
    expect(radioState(false)).toEqual({ checked: false });
    expect('selected' in radioState(true)).toBe(false);
  });
  it('adds disabled only when given', () => {
    expect(radioState(true, true)).toEqual({ checked: true, disabled: true });
    expect(radioState(false, false)).toEqual({ checked: false, disabled: false });
  });
});

// react-native-web does not turn accessibilityState.checked into aria-checked for role=radio, so a radio row
// also carries aria-checked itself (and aria-disabled when a disabled state is given).
describe('radioProps', () => {
  it('carries aria-checked as well as accessibilityState', () => {
    expect(radioProps(true)).toEqual({ accessibilityState: { checked: true }, 'aria-checked': true });
    expect(radioProps(false)).toEqual({ accessibilityState: { checked: false }, 'aria-checked': false });
  });
  it('adds disabled (and aria-disabled) only when given', () => {
    expect(radioProps(true, true)).toEqual({
      accessibilityState: { checked: true, disabled: true }, 'aria-checked': true, 'aria-disabled': true,
    });
    expect(radioProps(false, false)).toEqual({
      accessibilityState: { checked: false, disabled: false }, 'aria-checked': false, 'aria-disabled': false,
    });
    expect('aria-disabled' in radioProps(true)).toBe(false);
  });
});
