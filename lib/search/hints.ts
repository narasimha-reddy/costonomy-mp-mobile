/**
 * Rotating search hint (Home and Search bars): Search "paneer" -> Search "rice" ...
 *
 * Pure so the copy, order and timing are unit-tested without rendering.
 */
export const SEARCH_HINT_ITEMS = ['paneer', 'rice', 'eggs', 'milk', 'sugar', 'curd'] as const;

/** How long each hint stays before the next one replaces it. */
export const HINT_INTERVAL_MS = 2600;

/** Slide + fade between two hints. */
export const HINT_TRANSITION_MS = 350;

/** `Search "paneer"` — straight double quotes. */
export function formatSearchHint(item: string): string {
  return `Search "${item}"`;
}

/** The hint list both search bars pass to `MandiSearchBar`. */
export function searchHints(): string[] {
  return SEARCH_HINT_ITEMS.map(formatSearchHint);
}
