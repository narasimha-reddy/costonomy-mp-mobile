import { apiRequest } from '@/lib/api/client';
import { commonRequest } from '@/lib/api/common';
import { COMMON_CLIENT_ID } from '@/lib/api/config';
import type { AuthMe, AuthTokens } from '@/lib/session/types';

/**
 * Sign-in and sessions are costonomy-common-api's: one Costonomy account across the marketplace and the other apps.
 * The marketplace API accepts the same tokens and still answers `/auth/me` (memberships with marketplace roles).
 */
export interface OtpChallenge {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

interface OtpIssued extends OtpChallenge {
  challengeId: string;
}

interface CommonTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** The challenge each number was last sent, so the code screen only needs the phone. */
const challenges = new Map<string, string>();

/** E.164 for common: a bare 10-digit number is Indian, as the marketplace has always assumed. */
function e164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits;
}

function toTokens(t: CommonTokens): AuthTokens {
  return {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
  };
}

/** Sends a sign-in code by SMS. */
export async function requestOtp(phone: string): Promise<OtpChallenge> {
  const issued = await commonRequest<OtpIssued>('/v1/auth/otp/send', {
    method: 'POST',
    body: { channel: 'SMS', target: e164(phone), purpose: 'LOGIN', clientId: COMMON_CLIENT_ID },
  });
  challenges.set(e164(phone), issued.challengeId);
  return issued;
}

/** Checks the code; a number signing in for the first time gets an account. */
export async function verifyOtp(phone: string, otp: string): Promise<AuthTokens> {
  const challengeId = challenges.get(e164(phone));
  if (!challengeId) {
    throw new Error('That code has expired. Send a new one.');
  }
  const tokens = await commonRequest<CommonTokens>('/v1/auth/otp/verify', {
    method: 'POST',
    body: { challengeId, code: otp, clientId: COMMON_CLIENT_ID },
  });
  challenges.delete(e164(phone));
  return toTokens(tokens);
}

/** A new token pair; the refresh token rotates, so the caller stores both before using either. */
export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  return toTokens(await commonRequest<CommonTokens>('/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken, clientId: COMMON_CLIENT_ID },
  }));
}

/** Who the server says this is. The only source of role and membership truth. */
export function fetchMe(token: string): Promise<AuthMe> {
  return apiRequest<AuthMe>('/api/v1/auth/me', { token });
}

export function logout(token: string, refreshToken: string): Promise<void> {
  return commonRequest<void>('/v1/auth/logout', {
    method: 'POST',
    token,
    body: { refreshToken },
  });
}
