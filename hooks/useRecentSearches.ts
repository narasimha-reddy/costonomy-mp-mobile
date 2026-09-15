import { useCallback, useEffect, useState } from 'react';
import { getJsonPreference, setJsonPreference } from '@/lib/preferences';

const KEY = 'mp.recentSearches';
const LIMIT = 8;

/** Recent searches (doc 05 §6). Device-local: a convenience, never sent anywhere. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getJsonPreference<string[]>(KEY, []).then((stored) => {
      if (!cancelled) setRecent(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecent((current) => {
      // Case-insensitive de-dupe, most recent first: searching "Paneer" after
      // "paneer" should move one entry, not add a second.
      const next = [
        trimmed,
        ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, LIMIT);
      void setJsonPreference(KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecent([]);
    void setJsonPreference(KEY, []);
  }, []);

  return { recent, remember, clear };
}
