import { act, renderHook } from '@testing-library/react-native';
import { useDebouncedEdits } from '@/hooks/useDebouncedEdits';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** A commit the test settles by hand, so "in flight" is something it can observe. */
function manualCommit() {
  const calls: { key: number; value: number; settle: () => void }[] = [];
  const commit = jest.fn((key: number, value: number) =>
    new Promise<void>((resolve) => { calls.push({ key, value, settle: resolve }); }));
  return { commit, calls };
}

describe('useDebouncedEdits', () => {
  it('sends a burst of taps as one write of the last value', async () => {
    const { commit, calls } = manualCommit();
    const { result } = renderHook(() => useDebouncedEdits(commit, 400));

    act(() => { result.current.set(7, 2); });
    act(() => { result.current.set(7, 3); });
    act(() => { result.current.set(7, 4); });
    expect(commit).not.toHaveBeenCalled();
    // The tapped value is what shows, before anything is sent.
    expect(result.current.valueFor(7, 1)).toBe(4);

    await act(async () => { jest.advanceTimersByTime(400); });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(7, 4);

    await act(async () => { calls[0]?.settle(); });
    // Released once the write has finished: back to what the cart says.
    expect(result.current.valueFor(7, 1)).toBe(1);
  });

  it('sends an edit that is still waiting when the screen unmounts', async () => {
    const { commit } = manualCommit();
    const { result, unmount } = renderHook(() => useDebouncedEdits(commit, 400));

    act(() => { result.current.set(7, 5); });
    expect(commit).not.toHaveBeenCalled();

    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(commit).toHaveBeenCalledWith(7, 5);
  });

  it('flush sends what is waiting and resolves only after it has finished', async () => {
    const { commit, calls } = manualCommit();
    const { result } = renderHook(() => useDebouncedEdits(commit, 400));

    act(() => { result.current.set(7, 6); });
    let done = false;
    let flushing: Promise<void>;
    act(() => { flushing = result.current.flush().then(() => { done = true; }); });
    await act(async () => { await Promise.resolve(); });

    expect(commit).toHaveBeenCalledWith(7, 6);
    expect(done).toBe(false);

    await act(async () => { calls[0]?.settle(); await flushing; });
    expect(done).toBe(true);
  });

  it('never runs two writes for one line at once, and keeps their order', async () => {
    const { commit, calls } = manualCommit();
    const { result } = renderHook(() => useDebouncedEdits(commit, 400));

    act(() => { result.current.set(7, 2); });
    await act(async () => { jest.advanceTimersByTime(400); });
    act(() => { result.current.set(7, 3); });
    await act(async () => { jest.advanceTimersByTime(400); });

    // The second is held back until the first has finished.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe(2);

    await act(async () => { calls[0]?.settle(); });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.value).toBe(3);
    // The newer tap is still shown while its own write is pending.
    expect(result.current.valueFor(7, 1)).toBe(3);
  });

  it('discard drops a waiting edit', async () => {
    const { commit } = manualCommit();
    const { result } = renderHook(() => useDebouncedEdits(commit, 400));

    act(() => { result.current.set(7, 9); });
    act(() => { result.current.discard(7); });
    await act(async () => { jest.advanceTimersByTime(1000); });

    expect(commit).not.toHaveBeenCalled();
    expect(result.current.valueFor(7, 1)).toBe(1);
  });

  it('releases the held value even when the write fails', async () => {
    const commit = jest.fn(() => Promise.reject(new Error('refused')));
    const { result } = renderHook(() => useDebouncedEdits(commit, 400));

    act(() => { result.current.set(7, 8); });
    await act(async () => { jest.advanceTimersByTime(400); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.valueFor(7, 1)).toBe(1);
  });
});
