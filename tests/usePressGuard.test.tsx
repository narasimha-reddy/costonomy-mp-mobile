import { act, renderHook } from '@testing-library/react-native';
import { usePressGuard } from '@/hooks/usePressGuard';

describe('usePressGuard', () => {
  beforeEach(() => { jest.useFakeTimers({ now: 10_000 }); });
  afterEach(() => { jest.useRealTimers(); });

  it('a load is not a stage change: the first press after the order arrives goes through', () => {
    const { result, rerender } = renderHook(({ stage }: { stage: string | undefined }) => usePressGuard(stage, 800), {
      initialProps: { stage: undefined as string | undefined },
    });
    rerender({ stage: 'CONFIRMED' });
    const fn = jest.fn();
    act(() => { result.current.press(fn); });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a real stage change restarts the window, so the next stage button cannot be hit by the same tap', () => {
    const { result, rerender } = renderHook(({ stage }: { stage: string | undefined }) => usePressGuard(stage, 800), {
      initialProps: { stage: 'CONFIRMED' as string | undefined },
    });
    const fn = jest.fn();
    act(() => { jest.advanceTimersByTime(2000); });
    rerender({ stage: 'PREPARING' });
    act(() => { result.current.press(fn); });
    expect(fn).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(900); });
    act(() => { result.current.press(fn); });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
