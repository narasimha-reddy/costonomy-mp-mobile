import type { RadarSummary } from '@/models/delivery';

/**
 * The Orders tab's way into Deliveries, with what is open there.
 *
 * <p>The radar's `totalActive` counts every open delivery, including one delivered and waiting for this kitchen to
 * check it in (`pendingCheckInCount`, a subset of it: the server counts each delivery once). Calling those "active"
 * was untrue (flow review 4), so the two are said apart: "Deliveries · 1 active · 1 to check in". Counts only, read
 * from the server's summary; no money or dates.
 */
export function deliveriesLabel(summary: Pick<RadarSummary, 'totalActive' | 'pendingCheckInCount'> | null | undefined): {
  text: string;
  accessibilityLabel: string;
} {
  const total = summary?.totalActive ?? 0;
  const toCheckIn = Math.min(summary?.pendingCheckInCount ?? 0, total);
  const moving = total - toCheckIn;
  const parts = [
    moving > 0 ? `${moving} active` : null,
    toCheckIn > 0 ? `${toCheckIn} to check in` : null,
  ].filter((part): part is string => part != null);
  if (parts.length === 0) return { text: 'Deliveries', accessibilityLabel: 'Deliveries' };
  return { text: `Deliveries · ${parts.join(' · ')}`, accessibilityLabel: `Deliveries, ${parts.join(', ')}` };
}
