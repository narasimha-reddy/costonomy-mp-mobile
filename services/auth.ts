import { apiRequest } from '@/lib/api/client';
import type { AuthMe, AuthTokens } from '@/lib/session/types';

export interface OtpChallenge {
  expiresAt: string;
  resendAfterSeconds: number;
  maxAttempts: number;
  maskedPhone: string;
}

/** Doc 04 §5. The phone is sent unformatted; the server normalises it. */
export function requestOtp(phone: string, purpose = 'LOGIN'): Promise<OtpChallenge> {
  return apiRequest<OtpChallenge>('/api/v1/auth/otp/request', {
    method: 'POST',
    body: { phone, purpose },
  });
}

export function verifyOtp(phone: string, otp: string, purpose = 'LOGIN'): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/api/v1/auth/otp/verify', {
    method: 'POST',
    body: { phone, otp, purpose },
  });
}

export function refreshSession(refreshToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

/** Who the server says this is. The only source of role and membership truth. */
export function fetchMe(token: string): Promise<AuthMe> {
  return apiRequest<AuthMe>('/api/v1/auth/me', { token });
}

export function logout(token: string, refreshToken: string): Promise<void> {
  return apiRequest<void>('/api/v1/auth/logout', {
    method: 'POST',
    token,
    body: { refreshToken },
  });
}
