import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { fetchMe, logout as logoutRequest, refreshSession, verifyOtp } from '@/services/auth';
import { ApiError } from '@/lib/api/errors';
import { deleteSecret, getSecret, setSecret } from '@/lib/session/storage';
import { audienceOf, type Audience, type AuthMe, type AuthTokens } from '@/lib/session/types';

const ACCESS_TOKEN_KEY = 'mp.accessToken';
const REFRESH_TOKEN_KEY = 'mp.refreshToken';

interface SessionState {
  /** True until the stored session has been restored and checked. */
  restoring: boolean;
  authenticated: boolean;
  me: AuthMe | null;
  audience: Audience;
  accessToken: string | null;
  signIn: (phone: string, otp: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read `/auth/me`. Called after anything that changes membership. */
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * The session, and the only place tokens are held.
 *
 * <p><b>Roles come from the server, every time.</b> `audience` is derived from
 * the memberships `/auth/me` returns rather than from anything stored — doc 46
 * requires a revoked grant to take effect on the next request, and a cached role
 * would keep a removed user inside the app until they reinstalled it.
 *
 * <p><b>A 401 is the only error that signs someone out.</b> Everything else is a
 * problem with one request; treating a flaky network as a lost session is how an
 * app logs people out on the train.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [restoring, setRestoring] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);

  // Guards against two refreshes racing when several queries get a 401 at once.
  const refreshing = useRef<Promise<string | null> | null>(null);

  const persist = useCallback(async (tokens: AuthTokens) => {
    await setSecret(ACCESS_TOKEN_KEY, tokens.accessToken);
    await setSecret(REFRESH_TOKEN_KEY, tokens.refreshToken);
    setAccessToken(tokens.accessToken);
  }, []);

  const clear = useCallback(async () => {
    await deleteSecret(ACCESS_TOKEN_KEY);
    await deleteSecret(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setMe(null);
  }, []);

  /** Exchange the refresh token, or give up and clear the session. */
  const renew = useCallback(async (): Promise<string | null> => {
    if (refreshing.current) return refreshing.current;

    refreshing.current = (async () => {
      const refreshToken = await getSecret(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        await clear();
        return null;
      }
      try {
        const tokens = await refreshSession(refreshToken);
        await persist(tokens);
        return tokens.accessToken;
      } catch (error) {
        // A rejected refresh token means the session is genuinely over —
        // expired, revoked, or replayed (the backend revokes every session on a
        // replay). Anything else leaves the stored token alone to try again.
        if (error instanceof ApiError && error.isUnauthenticated) await clear();
        return null;
      } finally {
        refreshing.current = null;
      }
    })();

    return refreshing.current;
  }, [clear, persist]);

  const loadMe = useCallback(async (token: string): Promise<void> => {
    try {
      setMe(await fetchMe(token));
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthenticated) {
        const renewed = await renew();
        if (renewed) setMe(await fetchMe(renewed));
        return;
      }
      throw error;
    }
  }, [renew]);

  // Restore on cold start. §23A.5: the splash resolves to a real destination.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await getSecret(ACCESS_TOKEN_KEY);
        if (!stored) return;
        setAccessToken(stored);
        await loadMe(stored);
      } catch {
        // Offline at launch. The token stays; the user sees the signed-out
        // screen rather than a spinner, and signing in again is cheap.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => { cancelled = true; };
  }, [loadMe]);

  const signIn = useCallback(async (phone: string, otp: string) => {
    const tokens = await verifyOtp(phone, otp);
    await persist(tokens);
    await loadMe(tokens.accessToken);
  }, [loadMe, persist]);

  const signOut = useCallback(async () => {
    const [token, refreshToken] = await Promise.all([
      getSecret(ACCESS_TOKEN_KEY),
      getSecret(REFRESH_TOKEN_KEY),
    ]);
    if (token && refreshToken) {
      // Best effort: the server revokes the refresh token so it cannot be
      // replayed. Failing to reach it must not trap the user in the app.
      try {
        await logoutRequest(token, refreshToken);
      } catch {
        // Ignored deliberately — see above.
      }
    }
    await clear();
  }, [clear]);

  const reload = useCallback(async () => {
    if (accessToken) await loadMe(accessToken);
  }, [accessToken, loadMe]);

  const value = useMemo<SessionState>(() => ({
    restoring,
    authenticated: accessToken != null && me != null,
    me,
    audience: me ? audienceOf(me.memberships) : 'NONE',
    accessToken,
    signIn,
    signOut,
    reload,
  }), [accessToken, me, reload, restoring, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}
