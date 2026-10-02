import type { DisputeCategory } from '@/models/trust';

/** What each dispute category is called, in the order the raise screen offers them. */
export const DISPUTE_CATEGORIES: { key: DisputeCategory; label: string }[] = [
  { key: 'SHORT_QUANTITY', label: 'Short quantity' },
  { key: 'DAMAGED', label: 'Damaged' },
  { key: 'WRONG_PRODUCT', label: 'Wrong product' },
  { key: 'EXPIRED', label: 'Expired stock' },
  { key: 'QUALITY', label: 'Quality' },
  { key: 'INCORRECT_INVOICE', label: 'Invoice is wrong' },
  { key: 'OTHER', label: 'Something else' },
];

export function categoryLabel(category: string): string {
  return DISPUTE_CATEGORIES.find((c) => c.key === category)?.label
    ?? category.charAt(0) + category.slice(1).toLowerCase().replace(/_/g, ' ');
}
