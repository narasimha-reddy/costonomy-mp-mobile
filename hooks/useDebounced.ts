import { useEffect, useState } from 'react';

/**
 * A value that settles before anything acts on it.
 *
 * <p>Doc 05 §6: search must feel instant, and the way to make it feel instant is
 * to keep the field responding on every keystroke while the network call waits
 * for a pause. Debouncing the input itself would make typing feel laggy.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
