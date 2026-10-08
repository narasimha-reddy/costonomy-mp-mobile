/** Plain words for a doorstep rejection reason code. The code is the server's; the screen never shows it raw. */
const LABELS: Record<string, string> = {
  DAMAGED_CRATE: 'Damaged crate',
  SPOILED_PERISHABLE: 'Spoiled goods',
  WRONG_GRADE: 'Wrong grade',
  SHORT_DELIVERY: 'Short delivery',
  TEMPERATURE_ABUSE: 'Warm or melted',
  OTHER: 'Other',
};

export function rejectionReasonLabel(reason: string | null | undefined): string {
  if (reason == null || reason.trim() === '') return 'Damaged';
  const known = LABELS[reason];
  if (known != null) return known;
  const words = reason.trim().toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
