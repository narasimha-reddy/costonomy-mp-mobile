import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Analytics. Doc 05 §37.
 *
 * <p>Every key CTA emits screen, action, role, outlet, entity id, timestamp, app
 * version and correlation id. The shape is fixed here so a screen cannot invent
 * its own and a later transport swap is one file.
 *
 * <p><b>Never include an OTP or a payment credential</b> — §37 says so outright,
 * and `sanitize` drops anything whose key looks like one rather than trusting
 * every call site to remember. A blocklist that runs on every event is worth more
 * than a convention nobody can enforce at review time.
 *
 * <p>Today it logs in development and drops in production. The provider lands
 * with the analytics backend; what matters now is that call sites are already
 * correct, because retrofitting event names across fifty screens is the part that
 * never happens.
 */
export interface AnalyticsContext {
  screen: string;
  role?: string | null;
  outletId?: number | null;
  entityId?: number | string | null;
  requestId?: string | null;
}

const FORBIDDEN = /otp|code|password|secret|token|card|cvv|upi|vpa|account_?number/i;

export function track(action: string, context: AnalyticsContext, extra?: Record<string, unknown>) {
  const event = {
    action,
    screen: context.screen,
    role: context.role ?? null,
    outletId: context.outletId ?? null,
    entityId: context.entityId ?? null,
    requestId: context.requestId ?? null,
    timestamp: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? 'dev',
    platform: Platform.OS,
    ...sanitize(extra),
  };

  if (__DEV__) {
    console.log('[analytics]', event.action, event);
  }
}

function sanitize(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return {};
  return Object.fromEntries(
    Object.entries(extra).filter(([key]) => !FORBIDDEN.test(key)),
  );
}
