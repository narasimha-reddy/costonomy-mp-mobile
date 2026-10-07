import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { MandiFormField, MandiScreen, MandiStickyBar, fieldScrollTarget } from '@/components/common';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});

function Form({ avoidKeyboard }: { avoidKeyboard?: boolean }) {
  return (
    <MandiScreen
      avoidKeyboard={avoidKeyboard}
      moreBelow="Scroll for more"
      footer={<MandiStickyBar><Text testID="the-footer">Send</Text></MandiStickyBar>}
    >
      <MandiFormField label="Note" value="" onChangeText={() => {}} testID="note" />
    </MandiScreen>
  );
}

const handlers: Record<string, (e: unknown) => void> = {};
function emitKeyboard(name: string, event: unknown) { handlers[name]?.(event); }
beforeEach(() => {
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: (e: unknown) => void) => {
    handlers[name] = cb;
    return { remove: () => { delete handlers[name]; } };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('MandiScreen avoidKeyboard', () => {
  it('wraps the scroll area and the footer in one keyboard-avoiding view', () => {
    render(<Form avoidKeyboard />);
    const avoiding = screen.getByTestId('mandi-screen-keyboard-avoiding');
    expect(avoiding.props.behavior ?? screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    expect(within(avoiding).getByTestId('the-footer')).toBeTruthy();
    expect(within(avoiding).getByTestId('mandi-screen-scroll')).toBeTruthy();
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.keyboardDismissMode).toBe('on-drag');
  });

  it('adds no wrapper unless asked', () => {
    render(<Form />);
    expect(screen.queryByTestId('mandi-screen-keyboard-avoiding')).toBeNull();
  });

  it('scrolls the focused field into view above the keyboard, using the keyboard height', () => {
    render(<Form avoidKeyboard />);
    const scroll = screen.UNSAFE_getByType(ScrollView).instance as unknown as {
      scrollTo: jest.Mock; getInnerViewRef: () => unknown;
    };
    scroll.scrollTo = jest.fn();
    scroll.getInnerViewRef = () => ({});
    const field = screen.UNSAFE_getAllByProps({ testID: 'note-field' })[0] as unknown as { instance: { measureLayout: unknown } };
    // The field sits at y=1872..2061 of a 2400 px screen; the keyboard is 883 px tall.
    field.instance.measureLayout = (_to: unknown, ok: (x: number, y: number, w: number, h: number) => void) =>
      ok(0, 1872, 900, 189);
    fireEvent(screen.getByTestId('mandi-screen-scroll'), 'layout', { nativeEvent: { layout: { height: 1500 } } });

    act(() => { emitKeyboard('keyboardDidShow', { endCoordinates: { height: 883 } }); });
    fireEvent(screen.getByTestId('note'), 'focus');

    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    const { y } = scroll.scrollTo.mock.calls[0][0];
    // The field bottom (2061 + margin) ends up at or above the visible bottom (1500 - 883).
    expect(y).toBeGreaterThan(0);
    expect(2061 + 16 - y).toBeLessThanOrEqual(1500 - 883);
  });

  it('waits for the keyboard when the field is focused first', () => {
    render(<Form avoidKeyboard />);
    const scroll = screen.UNSAFE_getByType(ScrollView).instance as unknown as {
      scrollTo: jest.Mock; getInnerViewRef: () => unknown;
    };
    scroll.scrollTo = jest.fn();
    scroll.getInnerViewRef = () => ({});
    const field = screen.UNSAFE_getAllByProps({ testID: 'note-field' })[0] as unknown as { instance: { measureLayout: unknown } };
    field.instance.measureLayout = (_to: unknown, ok: (x: number, y: number, w: number, h: number) => void) =>
      ok(0, 1872, 900, 189);
    fireEvent(screen.getByTestId('mandi-screen-scroll'), 'layout', { nativeEvent: { layout: { height: 1500 } } });
    fireEvent(screen.getByTestId('note'), 'focus');
    expect(scroll.scrollTo).not.toHaveBeenCalled();
    act(() => { emitKeyboard('keyboardDidShow', { endCoordinates: { height: 883 } }); });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('hides the "more below" cue while the keyboard is open', () => {
    render(<Form avoidKeyboard />);
    const scroll = screen.getByTestId('mandi-screen-scroll');
    fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: 300 } } });
    fireEvent(scroll, 'contentSizeChange', 300, 1200);
    expect(screen.queryByTestId('more-below')).not.toBeNull();
    act(() => { emitKeyboard('keyboardDidShow', { endCoordinates: { height: 883 } }); });
    expect(screen.queryByTestId('more-below')).toBeNull();
    act(() => { emitKeyboard('keyboardDidHide', {}); });
    expect(screen.queryByTestId('more-below')).not.toBeNull();
  });
});

describe('fieldScrollTarget', () => {
  const base = { viewport: 1500, baseViewport: 1500, keyboard: 883, scrollY: 0 };
  it('scrolls a field that is under the keyboard', () => {
    const y = fieldScrollTarget({ ...base, fieldY: 1872, fieldHeight: 189 });
    expect(y).not.toBeNull();
    expect(1872 + 189 + 16 - (y as number)).toBeLessThanOrEqual(1500 - 883);
  });
  it('leaves a field that is already visible', () => {
    expect(fieldScrollTarget({ ...base, fieldY: 100, fieldHeight: 100 })).toBeNull();
  });
  it('scrolls back up to a field above the top edge', () => {
    expect(fieldScrollTarget({ ...base, scrollY: 500, fieldY: 200, fieldHeight: 80 })).toBe(184);
  });
});
