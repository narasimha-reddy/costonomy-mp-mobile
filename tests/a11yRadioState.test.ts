import { radioState } from '@/lib/a11y';

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
