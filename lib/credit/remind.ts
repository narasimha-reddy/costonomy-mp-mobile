import { ApiError } from '@/lib/api/errors';
import { istDayMonth, istTime } from '@/lib/credit/istFormat';

export const NOTE_MAX = 300;

/** The channels a reminder goes on, in words. SMS only comes with an overdue invoice. */
export function channelsText(channels: readonly string[]): string {
  const app = channels.includes('IN_APP');
  const push = channels.includes('PUSH');
  const sms = channels.includes('SMS');
  let base = '';
  if (app && push) base = 'In the app and as a notification';
  else if (app) base = 'In the app';
  else if (push) base = 'As a notification';
  if (sms) return base === '' ? 'As an SMS because it is overdue' : `${base}, and an SMS because it is overdue`;
  return base;
}

/** "It will be sent at 9 am on 7th Oct.", from the server's own send time, in India time. */
export function queuedText(sendAt: string | null | undefined): string {
  const time = istTime(sendAt) ?? '9 am';
  const day = istDayMonth(sendAt);
  return day == null ? `It will be sent at ${time}.` : `It will be sent at ${time} on ${day}.`;
}

export function skipReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case 'CLAIM_SUBMITTED': return 'They already say they paid this';
    case 'NOT_DUE': return 'Not due yet';
    default: return 'Left out';
  }
}

function when(nextAllowedAt: string | null | undefined): string {
  const day = istDayMonth(nextAllowedAt);
  const time = istTime(nextAllowedAt);
  return day == null || time == null ? 'later' : `${time} on ${day}`;
}

/** The message for a limit: WEEK is 3 a line in 7 days, STORE_DAY is 50 a store in a day. */
export function limitMessage(limit: string | null | undefined, nextAllowedAt: string | null | undefined): string {
  const at = when(nextAllowedAt);
  if (limit === 'STORE_DAY') return `Your store has sent 50 reminders a day, the most allowed. You can send more at ${at}.`;
  return `You have sent this restaurant 3 reminders a week, the most allowed. You can remind again at ${at}.`;
}

/** Why a reminder cannot go out now, in words. `reason` and `nextAllowedAt` are the server's. */
export function blockedText(reason: string | null | undefined, nextAllowedAt: string | null | undefined): string {
  switch (reason) {
    case 'NOTHING_DUE': return 'Nothing is due yet, so there is nothing to remind them about.';
    case 'CLAIM_COVERED': return 'They say they have paid what is due. Confirm or reject that first.';
    case 'TOO_SOON': return `You can remind again at ${when(nextAllowedAt)}.`;
    case 'WEEK_LIMIT': return limitMessage('WEEK', nextAllowedAt);
    case 'STORE_DAY_LIMIT': return limitMessage('STORE_DAY', nextAllowedAt);
    default: return "A reminder can't be sent right now.";
  }
}

/** Null when the preview allows a reminder; else the reason in words. Used to keep Send off. */
export function preflightMessage(
  preview: { canRemind: boolean; reason: string | null; nextAllowedAt: string | null },
): string | null {
  return preview.canRemind ? null : blockedText(preview.reason, preview.nextAllowedAt);
}

export const REMINDER_RETRY_TEXT = "That didn't go through. Please try again.";
export const REMINDER_MAY_HAVE_WORKED_TEXT =
  'Your earlier try may have been sent. We have refreshed the list: please check before sending again.';

/** A refused or failed send, in plain words (never a raw code). */
export function reminderErrorText(caught: unknown): string {
  if (!(caught instanceof ApiError)) return REMINDER_RETRY_TEXT;
  const d = caught.details ?? {};
  const next = typeof d.nextAllowedAt === 'string' ? d.nextAllowedAt : null;
  switch (caught.code) {
    case 'CREDIT_REMINDER_TOO_SOON': return blockedText('TOO_SOON', next);
    case 'CREDIT_REMINDER_LIMIT': return limitMessage(typeof d.limit === 'string' ? d.limit : null, next);
    case 'CREDIT_REMINDER_NOT_NEEDED': return blockedText(typeof d.reason === 'string' ? d.reason : 'NOTHING_DUE', null);
    case 'IDEMPOTENCY_KEY_REUSE': return REMINDER_MAY_HAVE_WORKED_TEXT;
    default: break;
  }
  if (caught.status === 403) return "You don't have permission to send reminders for this store.";
  if (caught.status === 404) return 'This credit line is no longer available. Go back and refresh.';
  if (caught.status >= 400 && caught.status < 500) {
    return caught.message !== '' ? caught.message : 'Please check the details and try again.';
  }
  return REMINDER_RETRY_TEXT;
}

export function historyKind(kind: string): string {
  switch (kind) {
    case 'MANUAL': return 'Manual';
    case 'AUTO_T3': return 'Automatic before due';
    case 'AUTO_DUE': return 'Due today';
    case 'AUTO_WEEKLY': return 'Weekly';
    default: return 'Reminder';
  }
}

export function historyStatus(status: string): string {
  return status === 'QUEUED' ? 'Waiting to send' : 'Sent';
}
