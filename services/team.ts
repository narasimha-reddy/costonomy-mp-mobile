import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commonRequest } from '@/lib/api/common';
import { newIdempotencyKey } from '@/lib/api/client';
import { useSession } from '@/contexts/SessionProvider';

/**
 * The team of a restaurant or supplier business. Membership is costonomy-common-api's — the same people and roles
 * the business has in Costonomy's other apps — so this reads and writes common directly.
 *
 * <p>Someone on the team holds a marketplace role (REST_… / SUP_…) at the business or at one outlet or store, plus
 * one of common's own roles for the business itself: admin for those who manage the team, member otherwise.
 */
export type Side = 'RESTAURANT' | 'SUPPLIER';

export interface Grant {
  id?: number;
  roleId: number;
  roleName?: string;
  roleCode?: string | null;
  app?: string;
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

export interface Role {
  id: number;
  app: string;
  code?: string | null;
  name: string;
  description?: string | null;
  level?: number | null;
  assignableScopes?: string[];
  permissions: string[];
}

/** Who can be given a marketplace role from the app: everyone but the owner, whose role comes with the business. */
const PREFIX: Record<Side, string> = { RESTAURANT: 'REST_', SUPPLIER: 'SUP_' };
const MANAGES_TEAM = ['OUTLET_USER_MANAGE', 'SUPPLIER_USER_MANAGE'];

const keys = {
  members: (orgId: number | null) => ['team', 'members', orgId] as const,
  invitations: (orgId: number | null) => ['team', 'invitations', orgId] as const,
  roles: (orgId: number | null, app: string) => ['team', 'roles', orgId, app] as const,
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

function useRoles(orgId: number | null, app: 'MARKETPLACE' | 'COMMON') {
  const { accessToken } = useSession();
  return useQuery({
    queryKey: keys.roles(orgId, app),
    queryFn: async () =>
      (await commonRequest<{ items: Role[] }>(`/v1/roles?app=${app}&orgId=${orgId}`, { token: accessToken })).items ?? [],
    enabled: orgId != null && accessToken != null,
    staleTime: 5 * 60_000,
  });
}

/** The marketplace roles of this side that can be given to someone, strongest first. */
export function useAssignableRoles(orgId: number | null, side: Side) {
  const roles = useRoles(orgId, 'MARKETPLACE');
  const data = (roles.data ?? [])
    .filter((r) => r.code?.startsWith(PREFIX[side]) && !r.code.endsWith('_OWNER'))
    .sort((a, b) => (a.level ?? 9) - (b.level ?? 9) || a.name.localeCompare(b.name));
  return { ...roles, data };
}

/** The marketplace role a member holds (the strongest, if several). */
export function marketplaceGrant(member: { grants: Grant[] }, side: Side): Grant | undefined {
  return member.grants.find((g) => g.app === 'MARKETPLACE' && g.roleCode?.startsWith(PREFIX[side]));
}

/**
 * The grants for a marketplace role at the business (`outletId` null) or one outlet/store: the role itself, and
 * common's role for the business — admin (outlet manager at one outlet) when the role manages the team.
 */
function useGrantsFor(orgId: number | null) {
  const common = useRoles(orgId, 'COMMON');
  return (role: Role, outletId: number | null): Grant[] => {
    const managesTeam = role.permissions.some((p) => MANAGES_TEAM.includes(p));
    const commonCode = managesTeam ? (outletId == null ? 'ORG_ADMIN' : 'OUTLET_MANAGER') : 'MEMBER';
    const commonRole = (common.data ?? []).find((r) => r.code === commonCode);
    const scopeType = outletId == null ? 'ORG' : 'OUTLET';
    const grants: Grant[] = [{ roleId: role.id, scopeType, scopeId: outletId }];
    if (commonRole) grants.unshift({ roleId: commonRole.id, scopeType, scopeId: outletId });
    return grants;
  };
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
  const grantsFor = useGrantsFor(orgId);
  return useMutation({
    mutationFn: (i: InviteInput) => commonRequest<Invitation>(`/v1/orgs/${orgId}/invitations`, {
      method: 'POST',
      token: accessToken,
      idempotencyKey: newIdempotencyKey(),
      body: {
        target: toE164(i.phone),
        targetType: 'PHONE',
        name: i.name?.trim() || null,
        grants: grantsFor(i.role, i.outletId),
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
 * Gives a member a different marketplace role or scope. Common replaces all of a member's grants in one call, so
 * their grants in Costonomy's other apps go back unchanged.
 */
export function useChangeRole(orgId: number | null, side: Side) {
  const qc = useQueryClient();
  const { accessToken, reload } = useSession();
  const grantsFor = useGrantsFor(orgId);
  return useMutation({
    mutationFn: ({ member, role, outletId }: { member: Member; role: Role; outletId: number | null }) => {
      const kept = member.grants.filter((g) => g.app !== 'COMMON' && !(g.app === 'MARKETPLACE'
        && g.roleCode?.startsWith(PREFIX[side])));
      const grants = [...grantsFor(role, outletId), ...kept]
        .map(({ roleId, scopeType, scopeId }) => ({ roleId, scopeType, scopeId }));
      return commonRequest<Member>(`/v1/orgs/${orgId}/members/${member.membershipId}/grants`, {
        method: 'PUT',
        token: accessToken,
        body: { grants, primaryOutletId: outletId },
      });
    },
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
