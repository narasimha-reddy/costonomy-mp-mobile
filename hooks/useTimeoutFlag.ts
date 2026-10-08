import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `ms`; false again as soon as it turns false. */
export function useTimeoutFlag(active: boolean, ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) {
      setDone(false);
      return undefined;
    }
    const id = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return active && done;
}
