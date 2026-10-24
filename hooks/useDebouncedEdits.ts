import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Quantity edits that are held briefly, sent as one decision, and never lost.
 *
 * <p>Three things the basket got wrong when every tap was its own request:
 * a burst of taps raced several writes for one line; leaving the screen threw
 * away an edit still waiting its turn; and sending the basket could go out
 * before the edit that was meant to precede it. So:
 *
 * <ul>
 *   <li>the latest tapped value is shown at once and sent after {@code delayMs}
 *       of quiet — the value is absolute, so only the last tap matters;</li>
 *   <li>writes for one key are chained, never concurrent, so they land in the
 *       order they were made;</li>
 *   <li>{@code flush} sends whatever is waiting and resolves when everything
 *       in flight has finished — screens await it before sending or ordering —
 *       and unmounting flushes too, instead of dropping the edit.</li>
 * </ul>
 *
 * <p>{@code commit} owns its own error handling (a toast). Whether it fails or
 * not, the held value is released once nothing newer is waiting, so the stepper
 * goes back to what the cart says.
 */
export function useDebouncedEdits(
  commit: (key: number, value: number) => Promise<unknown>,
  delayMs = 400,
) {
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const wanted = useRef(new Map<number, number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<number, Promise<void>>());
  const [shown, setShown] = useState<Record<number, number>>({});

  const run = useCallback((key: number): void => {
    const timer = timers.current.get(key);
    if (timer != null) clearTimeout(timer);
    timers.current.delete(key);

    const value = wanted.current.get(key);
    if (value == null) return;
    wanted.current.delete(key);

    const previous = inflight.current.get(key) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(() => commitRef.current(key, value))
      .then(() => undefined, () => undefined)
      .then(() => {
        // Release the held value only when this was the newest write and no
        // newer tap is waiting; an older write finishing must not drop it.
        const newest = inflight.current.get(key) === next;
        if (newest) inflight.current.delete(key);
        if (newest && !wanted.current.has(key)) {
          setShown((current) => {
            const { [key]: _released, ...rest } = current;
            return rest;
          });
        }
      });
    inflight.current.set(key, next);
  }, []);

  /** Hold {@code value} for {@code key} and send it once taps stop. */
  const set = useCallback((key: number, value: number) => {
    wanted.current.set(key, value);
    setShown((current) => ({ ...current, [key]: value }));
    const timer = timers.current.get(key);
    if (timer != null) clearTimeout(timer);
    timers.current.set(key, setTimeout(() => run(key), delayMs));
  }, [delayMs, run]);

  /** Forget a held edit for {@code key} (the line is being removed instead). */
  const discard = useCallback((key: number) => {
    const timer = timers.current.get(key);
    if (timer != null) clearTimeout(timer);
    timers.current.delete(key);
    wanted.current.delete(key);
    setShown((current) => {
      const { [key]: _released, ...rest } = current;
      return rest;
    });
  }, []);

  /** Send everything waiting; resolves when nothing is waiting or in flight. */
  const flush = useCallback(async () => {
    for (const key of [...wanted.current.keys()]) run(key);
    await Promise.all([...inflight.current.values()]);
  }, [run]);

  useEffect(() => () => { void flush(); }, [flush]);

  const valueFor = useCallback(
    (key: number, fallback: number) => shown[key] ?? fallback,
    [shown],
  );

  return { set, discard, flush, valueFor };
}
