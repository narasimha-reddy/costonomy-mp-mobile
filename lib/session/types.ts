/** Doc 04 §5's `/auth/me`. The server's answer about who this is. */
export interface AuthUser {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  status: string;
  phoneVerifiedAt: string | null;
}

/**
 * One scope the user holds a role in.
 *
 * <p>`permissions` is present so a screen can hide an action the user cannot
 * take — but hiding is a courtesy, never a control. Doc 09 §2: "never rely on
 * mobile route visibility for security", and the server checks every call
 * regardless.
 */
export interface Membership {
  scopeType: 'RESTAURANT' | 'OUTLET' | 'SUPPLIER' | 'SUPPLIER_STORE' | 'PLATFORM';
  scopeId: number | null;
  scopeName: string | null;
  parentScopeId: number | null;
  parentScopeName: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthMe {
  user: AuthUser;
  memberships: Membership[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
}

/**
 * Which experience to show. v2.2 §5: one app, role-based views.
 *
 * <p>Derived from the server's memberships, never from anything the user chose
 * or the client cached — a person can genuinely be both (a restaurant owner who
 * also supplies), and `NONE` is a real state: someone who signed in but belongs
 * to no organisation yet.
 */
export type Audience = 'RESTAURANT' | 'SUPPLIER' | 'BOTH' | 'NONE';

export function audienceOf(memberships: Membership[]): Audience {
  const restaurant = memberships.some(
    (m) => m.scopeType === 'RESTAURANT' || m.scopeType === 'OUTLET',
  );
  const supplier = memberships.some(
    (m) => m.scopeType === 'SUPPLIER' || m.scopeType === 'SUPPLIER_STORE',
  );

  if (restaurant && supplier) return 'BOTH';
  if (restaurant) return 'RESTAURANT';
  if (supplier) return 'SUPPLIER';
  return 'NONE';
}

/**
 * Outlet-scope grants only.
 *
 * <p><b>This is not the list of outlets a user can order for</b>, and no screen
 * should render it as one: an owner's grant sits at RESTAURANT scope and covers
 * every outlet beneath it without an OUTLET row ever existing. `useOutlets()` in
 * `lib/outlets.ts` resolves the real list; this stays for the narrow question of
 * which outlets were granted individually.
 */
export function outletGrantsOf(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => m.scopeType === 'OUTLET');
}

/**
 * Store-scope grants only.
 *
 * <p>Carries the same caveat as {@link outletGrantsOf}: a SUPPLIER-scope grant
 * covers every store under it, so this is not "the stores this user can act
 * for". M4 resolves that list against the server the way `useOutlets()` does.
 */
export function storeGrantsOf(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => m.scopeType === 'SUPPLIER_STORE');
}
