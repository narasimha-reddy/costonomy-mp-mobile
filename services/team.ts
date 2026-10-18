import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commonRequest } from '@/lib/api/common';
import { newIdempotencyKey } from '@/lib/api/client';
import { useSession } from '@/contexts/SessionProvider';

/**
 * The team of a restaurant or supplier business. Membership is costonomy-common-api's — the same people and roles
 * the business has in Costonomy's other apps — so this reads and writes common directly.
 *
 * <p>Common's access model (its D-75): each person holds one role for the whole business, or one per outlet or store,
 * and that role covers every Costonomy app. Roles are the five built-in ones (Owner, Admin, Manager, Staff, Viewer)
 * and any the business made itself; what each may do in the marketplace is part of the role.
 */
export type Side = 'RESTAURANT' | 'SUPPLIER';

export interface Grant {
  id?: number;
  roleId: number;
  roleName?: string;
  /** OWNER, ADMIN, MANAGER, STAFF or VIEWER on the built-in roles; null on the business's own. */
  template?: string | null;
  scopeType: 'ORG' | 'OUTLET';
  scopeId: number | null;
}

export interface Member {
  membershipId: number;
  userId: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  primaryOutletId?: number | null;
  accessLevel: 'BUSINESS' | 'OUTLET' | string;
  grants: Grant[];
}

export interface Invitation {
  id: number;
  target: string;
  inviteeName?: string | null;
  grants: Grant[];
  primaryOutletId?: number | null;
  status: string;
  expiresAt?: string;
}

/** A built-in role (template) or one of the business's own. */
export interface Role {
  id: number;
  name: string;
  description?: string | null;
  /** Set on the five built-in roles; null on the business's own. */
  template?: string | null;
  custom?: boolean;
  /** `<module>.<action>` codes by app (COMMON, MARKETPLACE, …). */
  permissions: Record<string, string[]>;
}

/** Built-in roles strongest first; the business's own follow, by name. */
const ORDER = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];

const keys = {
  members: (orgId: number | null) => ['team', 'members', orgId] as const,
  invitations: (orgId: number | null) => ['team', 'invitations', orgId] as const,
  roles: (orgId: number | null) => ['team', 'roles', orgId] as const,
};

export function useMembers(orgId: number | null) {
  const { accessToken } = useSession();
  return useQuery({
    queryKey: keys.members(orgId),
    queryFn: async () => (await commonRequest<{ items: Member[] }>(`/v1/orgs/${orgId}/members`, { token: accessToken }))
      .items ?? [],
    enabled: orgId != null && accessToken != null,
  });
}

export function useInvitations(orgId: number | null) {
  const { accessToken } = useSession();
  return useQuery({
    queryKey: keys.invitations(orgId),
    queryFn: async () =>
      ((await commonRequest<{ items: Invitation[] }>(`/v1/orgs/${orgId}/invitations`, { token: accessToken })).items ?? [])
        .filter((i) => i.status === 'PENDING'),
    enabled: orgId != null && accessToken != null,
  });
}

function useRoles(orgId: number | null) {
  const { accessToken } = useSession();
  return useQuery({
    queryKey: keys.roles(orgId),
    queryFn: async () =>
      (await commonRequest<{ items: Role[] }>(`/v1/orgs/${orgId}/roles`, { token: accessToken })).items ?? [],
    enabled: orgId != null && accessToken != null,
    staleTime: 5 * 60_000,
  });
}

/** The roles that can be given to someone: every one but Owner, which comes with the business. */
export function useAssignableRoles(orgId: number | null) {
  const roles = useRoles(orgId);
  const rank = (r: Role) => (r.template ? ORDER.indexOf(r.template) : ORDER.length);
  const data = (roles.data ?? [])
    .filter((r) => r.template !== 'OWNER')
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { ...roles, data };
}

/** Someone's role: the whole-business one, else their first outlet or store. */
export function roleGrant(member: { grants: Grant[] }): Grant | undefined {
  return member.grants.find((g) => g.scopeType === 'ORG') ?? member.grants[0];
}

export interface InviteInput {
  phone: string;
  name?: string;
  role: Role;
  /** An outlet or store; null for the whole business. */
  outletId: number | null;
}

/** E.164: a bare 10-digit number is Indian. */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits;
}

export function useInvite(orgId: number | null) {
  const qc = useQueryClient();
  const { accessToken } = useSession();
  return useMutation({
    mutationFn: (i: InviteInput) => commonRequest<Invitation>(`/v1/orgs/${orgId}/invitations`, {
      method: 'POST',
      token: accessToken,
      idempotencyKey: newIdempotencyKey(),
      body: {
        target: toE164(i.phone),
        targetType: 'PHONE',
        name: i.name?.trim() || null,
        grants: [{ roleId: i.role.id, scopeType: i.outletId == null ? 'ORG' : 'OUTLET', scopeId: i.outletId }],
        primaryOutletId: i.outletId,
        appCode: 'MARKETPLACE',
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.invitations(orgId) });
      qc.invalidateQueries({ queryKey: keys.members(orgId) });
    },
  });
}

export function useRevokeInvitation(orgId: number | null) {
  const qc = useQueryClient();
  const { accessToken } = useSession();
  return useMutation({
    mutationFn: (id: number) => commonRequest(`/v1/invitations/${id}`, { method: 'DELETE', token: accessToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  });
}

/**
 * Gives a member a different role, for the whole business or one outlet or store. Common holds one role per scope
 * across every app, so this replaces their access everywhere, as Costonomy's other apps do.
 */
export function useChangeRole(orgId: number | null) {
  const qc = useQueryClient();
  const { accessToken, reload } = useSession();
  return useMutation({
    mutationFn: ({ member, role, outletId }: { member: Member; role: Role; outletId: number | null }) =>
      commonRequest<Member>(`/v1/orgs/${orgId}/members/${member.membershipId}/access`, {
        method: 'PUT',
        token: accessToken,
        body: outletId == null
          ? { businessRoleId: role.id, outlets: [], primaryOutletId: null }
          : { businessRoleId: null, outlets: [{ outletId, roleId: role.id }], primaryOutletId: outletId },
      }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: keys.members(orgId) });
      await reload();
    },
  });
}

export function useRemoveMember(orgId: number | null) {
  const qc = useQueryClient();
  const { accessToken } = useSession();
  return useMutation({
    mutationFn: (membershipId: number) =>
      commonRequest(`/v1/orgs/${orgId}/members/${membershipId}`, { method: 'DELETE', token: accessToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(orgId) }),
  });
}
