/**
 * Lets the API client renew an expired access token without importing React.
 *
 * <p>An access token lives fifteen minutes. Every screen query passed its token
 * straight to `apiRequest`, so once it expired each one failed on its own — the
 * app looked broken fifteen minutes after sign-in, and the fix a user found was
 * to force-quit it. The refresh logic existed; nothing but `/auth/me` ever
 * reached it.
 *
 * <p>The client cannot call `useSession`, and the session provider cannot be
 * imported by the client without a cycle. So the provider registers its renewal
 * function here on mount and the client asks for one when a call comes back 401.
 *
 * <p>One function, set by one provider. If nothing is registered — a unit test, a
 * request made before the provider mounts — a 401 stays a 401, which is the
 * correct answer rather than a silent hang.
 */
type Renew = () => Promise<string | null>;

let renew: Renew | null = null;

export function registerTokenRenewal(fn: Renew | null): void {
  renew = fn;
}

export async function renewAccessToken(): Promise<string | null> {
  if (renew == null) return null;
  try {
    return await renew();
  } catch {
    // A failed renewal is a failed request, not a crash in the middle of one.
    return null;
  }
}
