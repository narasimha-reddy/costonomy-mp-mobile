import { act, renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent } from 'react-native';
import { anchoredY, useFormScroll } from '@/components/wallet/review/formContext';
import { Spacing } from '@/theme';

/**
 * "Scroll to the first error" and "scroll to the new line" from layout offsets alone (the anchors each
 * field records with onLayout), so it works the same on native and on the web and can be tested here,
 * where measuring does nothing.
 */

const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height: 40 } } }) as LayoutChangeEvent;
const MARGIN = Spacing.xxl * 2;

function setup() {
  const hook = renderHook(() => useFormScroll());
  const scrollTo = jest.fn();
  (hook.result.current.scroll as { current: unknown }).current = { scrollTo };
  const lay = (key: string, parent: string | null, y: number) => act(() => { hook.result.current.api.anchor(key, parent)(layout(y)); });
  return { ...hook, scrollTo, lay };
}

describe('scrolling the review form to a field', () => {
  it('adds up the offsets of a field and its parents', () => {
    const anchors = new Map([
      ['lines', { parent: null, y: 600 }],
      ['line:a:row', { parent: 'lines', y: 250 }],
      ['line:a:numbers', { parent: 'line:a:row', y: 130 }],
      ['line:a:amount', { parent: 'line:a:numbers', y: 0 }],
    ]);
    expect(anchoredY(anchors, 'line:a:amount')).toBe(980);
    expect(anchoredY(anchors, 'line:a:row')).toBe(850);
    expect(anchoredY(anchors, 'line:b:row')).toBeNull();
    // A parent that is not laid out yet means unknown, not 0.
    expect(anchoredY(new Map([['x', { parent: 'missing', y: 10 }]]), 'x')).toBeNull();
  });

  it('scrolls to a laid-out field, leaving room above it for its label', () => {
    const { result, scrollTo, lay } = setup();
    lay('lines', null, 600);
    lay('line:a:row', 'lines', 250);
    lay('line:a:numbers', 'line:a:row', 130);
    lay('line:a:amount', 'line:a:numbers', 8);
    act(() => { result.current.scrollToKey('line:a:amount'); });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 988 - MARGIN, animated: true });
    lay('details', null, 20);
    lay('supplier', 'details', 16);
    act(() => { result.current.scrollToKey('supplier'); });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true }); // never above the top
  });

  it('a field asked for before it is laid out (a new line) is scrolled to as soon as it is', () => {
    const { result, scrollTo, lay } = setup();
    lay('lines', null, 600);
    act(() => { result.current.scrollToKey('line:new:row'); });
    expect(scrollTo).not.toHaveBeenCalled();
    lay('line:new:row', 'lines', 1400);
    expect(scrollTo).toHaveBeenCalledWith({ y: 2000 - MARGIN, animated: true });
    // Once is enough: later layouts do not scroll again.
    scrollTo.mockClear();
    lay('line:new:row', 'lines', 1410);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('forgets a removed line, including a scroll still waiting for it', () => {
    const { result, scrollTo, lay } = setup();
    lay('lines', null, 600);
    act(() => { result.current.scrollToKey('line:gone:row'); });
    act(() => { result.current.forget('line:gone:'); });
    lay('line:gone:row', 'lines', 100);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('the messages at the top: scrolls to the top', () => {
    const { result, scrollTo } = setup();
    act(() => { result.current.scrollToTop(); });
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });
});
