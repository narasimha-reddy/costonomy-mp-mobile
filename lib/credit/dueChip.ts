import type { StatusTone } from '@/components/common/MandiStatusChip';
import type { CreditDueState } from '@/models/credit';

export interface DueChip {
  label: string;
  tone: StatusTone;
}

function inDays(n: number): string {
  return n === 1 ? 'Due tomorrow' : `Due in ${n} days`;
}

/**
 * The chip every credit screen shows for an invoice's due state.
 *
 * <p>The server classifies and counts the days; this only words them. An
 * unknown or missing state returns null so nothing is claimed about it.
 */
export function dueChip(
  dueState: CreditDueState | string | null | undefined,
  daysToDue: number | null | undefined,
): DueChip | null {
  const days = typeof daysToDue === 'number' ? daysToDue : null;
  switch (dueState) {
    case 'OVERDUE': return { label: 'Overdue', tone: 'danger' };
    case 'IN_GRACE': return { label: 'Past due', tone: 'warning' };
    case 'DUE_TODAY': return { label: 'Due today', tone: 'warning' };
    case 'DUE_SOON':
      return { label: days == null ? 'Due soon' : inDays(days), tone: 'warning' };
    case 'DUE_LATER':
      return { label: days == null ? 'Due later' : inDays(days), tone: 'neutral' };
    case 'PAID': return { label: 'Paid', tone: 'success' };
    case 'WRITTEN_OFF': return { label: 'Written off', tone: 'neutral' };
    default: return null;
  }
}
