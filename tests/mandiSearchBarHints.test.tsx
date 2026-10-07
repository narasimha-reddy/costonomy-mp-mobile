import React from 'react';
import { Animated, AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MandiSearchBar } from '@/components/common/MandiSearchBar';
import { HINT_INTERVAL_MS, HINT_TRANSITION_MS, searchHints } from '@/lib/search/hints';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
let mockReduced = false;
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));

const HINTS = searchHints();
let appStateListener: ((s: string) => void) | undefined;
const removeSub = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  mockReduced = false;
  appStateListener = undefined;
  removeSub.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateListener = cb;
    return { remove: removeSub };
  }) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const hint = () => screen.queryByTestId('bar-hint', { includeHiddenElements: true });
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
const tick = () => advance(HINT_INTERVAL_MS + HINT_TRANSITION_MS);

function bar(props: Partial<React.ComponentProps<typeof MandiSearchBar>> = {}) {
  return (
    <MandiSearchBar testID="bar" value="" onChangeText={() => {}} rotatingHints={HINTS} {...props} />
  );
}

describe('MandiSearchBar rotating hints', () => {
  it('starts at Search "paneer" deterministically', () => {
    render(bar());
    expect(hint()).toHaveTextContent('Search "paneer"');
  });

  it('rotates in order and wraps after six', () => {
    render(bar());
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      seen.push(String(hint()?.props.children));
      tick();
    }
    expect(seen).toEqual([
      'Search "paneer"', 'Search "rice"', 'Search "eggs"', 'Search "milk"',
      'Search "sugar"', 'Search "curd"', 'Search "paneer"',
    ]);
  });

  it('pauses when blurred and resumes when focused', () => {
    const { rerender } = render(bar());
    mockFocused = false;
    rerender(bar());
    tick();
    tick();
    expect(hint()).toHaveTextContent('Search "paneer"');
    mockFocused = true;
    rerender(bar());
    tick();
    expect(hint()).toHaveTextContent('Search "rice"');
  });

  it('pauses in the background and resumes when active', () => {
    render(bar());
    act(() => appStateListener?.('background'));
    tick();
    expect(hint()).toHaveTextContent('Search "paneer"');
    act(() => appStateListener?.('active'));
    tick();
    expect(hint()).toHaveTextContent('Search "rice"');
  });

  it('leaves no timers pending after unmount', () => {
    const set = jest.spyOn(global, 'setInterval');
    const clear = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(bar());
    expect(set).toHaveBeenCalledWith(expect.any(Function), HINT_INTERVAL_MS);
    const id = set.mock.results[0]!.value;
    unmount();
    expect(clear).toHaveBeenCalledWith(id);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(jest.getTimerCount()).toBe(0);
    expect(removeSub).toHaveBeenCalled();
  });

  it('hides the hint while text is typed and returns when cleared', () => {
    const { rerender } = render(bar());
    rerender(bar({ value: 'ri' }));
    expect(hint()).toBeNull();
    rerender(bar({ value: '' }));
    expect(hint()).toHaveTextContent('Search "paneer"');
  });

  it('keeps the real input working with an empty native placeholder', () => {
    const onChangeText = jest.fn();
    const onSubmit = jest.fn();
    render(bar({ onChangeText, onSubmit }));
    const input = screen.getByTestId('bar');
    expect(input.props.placeholder).toBe('');
    fireEvent.changeText(input, 'rice');
    expect(onChangeText).toHaveBeenCalledWith('rice');
    fireEvent(input, 'submitEditing');
    expect(onSubmit).toHaveBeenCalled();
  });

  it('is hidden from screen readers with one stable label and no live region', () => {
    render(bar());
    tick();
    expect(screen.getByTestId('bar').props.accessibilityLabel).toBe('Search for products');
    let layer = hint()!.parent!;
    while (layer.props.accessibilityElementsHidden !== true) layer = layer.parent!;
    expect(layer.props.accessibilityElementsHidden).toBe(true);
    expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(layer.props.pointerEvents).toBe('none');
    expect(JSON.stringify(hint()!.props)).not.toContain('accessibilityLiveRegion');
  });

  it('read-only: shows the hint, navigates on press, stable label and hint', () => {
    const onPress = jest.fn();
    render(bar({ readOnly: true, onPress, placeholder: 'Search paneer, rice, oil…' }));
    expect(hint()).toHaveTextContent('Search "paneer"');
    tick();
    const button = screen.getByRole('search');
    expect(button.props.accessibilityLabel).toBe('Search for products');
    expect(button.props.accessibilityHint).toBe('Opens search');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reduced motion swaps instantly with no Animated call', () => {
    mockReduced = true;
    const timing = jest.spyOn(Animated, 'timing');
    render(bar());
    tick();
    expect(hint()).toHaveTextContent('Search "rice"');
    expect(timing).not.toHaveBeenCalled();
  });

  it('animates with the native driver when motion is allowed', () => {
    const timing = jest.spyOn(Animated, 'timing');
    render(bar());
    advance(HINT_INTERVAL_MS);
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: HINT_TRANSITION_MS, useNativeDriver: true }),
    );
  });

  it('callers without rotatingHints are unchanged', () => {
    render(<MandiSearchBar testID="plain" value="" onChangeText={() => {}} placeholder="Find" />);
    const input = screen.getByTestId('plain');
    expect(input.props.placeholder).toBe('Find');
    expect(input.props.accessibilityLabel).toBe('Find');
    expect(screen.queryByTestId('plain-hint')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('an empty list falls back to the placeholder', () => {
    render(<MandiSearchBar testID="plain" value="" onChangeText={() => {}} placeholder="Find" rotatingHints={[]} />);
    expect(screen.getByTestId('plain').props.placeholder).toBe('Find');
  });
});
