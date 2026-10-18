import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  FilterPills,
  MandiBottomSheet,
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFab,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { ApiError } from '@/lib/api/errors';
import {
  roleGrant,
  useAssignableRoles,
  useChangeRole,
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  type Invitation,
  type Member,
  type Role,
  type Side,
} from '@/services/team';
import { Colors, Spacing } from '@/theme';

/** An outlet (restaurant) or store (supplier) the team can be scoped to. */
export interface TeamPlace {
  id: number;
  name: string;
}

interface Props {
  side: Side;
  orgId: number | null;
  places: TeamPlace[];
  /** Whether the viewer may invite, change and remove (common's team.edit). */
  canManage: boolean;
}

const WHOLE_BUSINESS = 'all';

/**
 * The people on a restaurant or supplier team, and the invitations not yet accepted.
 *
 * <p>The team is the business's in costonomy-common-api: someone added here can sign in to the marketplace with
 * their phone number, and is on the same team in Costonomy's other apps. A number without an account joins the
 * first time it signs in.
 */
export function TeamScreen({ side, orgId, places, canManage }: Props) {
  const { me } = useSession();
  const members = useMembers(orgId);
  const invitations = useInvitations(orgId);
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const placeName = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  const where = (outletId: number | null | undefined) =>
    outletId == null ? 'Whole business' : placeName.get(outletId) ?? `#${outletId}`;
  const placeLabel = side === 'SUPPLIER' ? 'store' : 'outlet';

  const list = (members.data ?? []).filter((m) => m.status !== 'REMOVED');

  return (
    <MandiScreen
      header={<MandiHeader title="Team" back />}
      onRefresh={() => { members.refetch(); invitations.refetch(); }}
      refreshing={members.isRefetching}
      floating={canManage ? <MandiFab accessibilityLabel="Invite someone" onPress={() => setInviting(true)} /> : undefined}
    >
      {members.isLoading ? (
        <MandiSkeletonList count={3} />
      ) : members.error ? (
        <MandiErrorState message="Couldn't load your team." />
      ) : list.length === 0 ? (
        <MandiEmptyState icon="people-outline" title="No one here yet"
          description={`Invite the people who order, receive and pay — by ${placeLabel} or for the whole business.`} />
      ) : (
        <>
          <MandiSectionHeader title="People" count={list.length} />
          {list.map((m) => {
            const grant = roleGrant(m);
            return (
              <MandiCard key={m.membershipId} onPress={canManage ? () => setSelected(m) : undefined}>
                <View style={styles.titleRow}>
                  <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
                    {m.name || m.phone || 'Unnamed'}
                    {String(m.userId) === String(me?.user.id) ? ' (you)' : ''}
                  </MandiText>
                  {m.status === 'SUSPENDED' && <MandiStatusChip label="Suspended" tone="warning" size="sm" />}
                </View>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {grant ? `${grant.roleName} · ${where(grant.scopeType === 'ORG' ? null : grant.scopeId)}` : 'No role yet'}
                </MandiText>
                {m.phone != null && m.name && (
                  <MandiText variant="caption" color={Colors.textTertiary}>{m.phone}</MandiText>
                )}
              </MandiCard>
            );
          })}
        </>
      )}

      {(invitations.data ?? []).length > 0 && (
        <>
          <MandiSectionHeader title="Invited" count={invitations.data!.length} subtitle="They join when they first sign in." />
          {invitations.data!.map((i) => (
            <InvitationCard key={i.id} invitation={i} orgId={orgId} side={side} where={where} canManage={canManage} />
          ))}
        </>
      )}

      {inviting && (
        <InviteSheet side={side} orgId={orgId} places={places} placeLabel={placeLabel} onClose={() => setInviting(false)} />
      )}
      {selected && (
        <MemberSheet side={side} orgId={orgId} member={selected} places={places} placeLabel={placeLabel}
          isSelf={String(selected.userId) === String(me?.user.id)} onClose={() => setSelected(null)} />
      )}
    </MandiScreen>
  );
}

function InvitationCard({ invitation, orgId, side, where, canManage }: {
  invitation: Invitation; orgId: number | null; side: Side; where: (id: number | null | undefined) => string;
  canManage: boolean;
}) {
  const revoke = useRevokeInvitation(orgId);
  const toast = useToast();
  const grant = roleGrant(invitation);
  // An invitation's grants carry only the role id; the name comes from the business's roles.
  const roles = useAssignableRoles(orgId);
  const roleName = grant?.roleName ?? roles.data.find((r) => r.id === grant?.roleId)?.name;
  return (
    <MandiCard>
      <View style={styles.titleRow}>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
          {invitation.inviteeName || invitation.target}
        </MandiText>
        <MandiStatusChip label="Invited" tone="pending" size="sm" />
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>
        {grant && roleName ? `${roleName} · ${where(grant.scopeType === 'ORG' ? null : grant.scopeId)}` : invitation.target}
      </MandiText>
      {canManage && (
        <MandiButton label="Cancel invitation" variant="tertiary" size="sm" loading={revoke.isPending}
          onPress={() => revoke.mutate(invitation.id, { onError: (e) => toast.show(message(e), 'error') })} />
      )}
    </MandiCard>
  );
}

/** Role and outlet/store pickers, shared by invite and change-role. */
function RoleAndPlace({ side, orgId, places, placeLabel, role, setRole, place, setPlace }: {
  side: Side; orgId: number | null; places: TeamPlace[]; placeLabel: string;
  role: Role | null; setRole: (r: Role) => void; place: string; setPlace: (p: string) => void;
}) {
  const roles = useAssignableRoles(orgId);
  return (
    <View style={styles.section}>
      <MandiText variant="label">Role</MandiText>
      {roles.isLoading ? <MandiSkeletonList count={2} /> : roles.data.map((r) => (
        <MandiCard key={r.id} outlined compact onPress={() => setRole(r)}
          accentColor={role?.id === r.id ? Colors.primary : undefined}>
          <MandiText variant="bodyEmphasis" color={role?.id === r.id ? Colors.primary : undefined}>{r.name}</MandiText>
          {r.description ? <MandiText variant="caption" color={Colors.textSecondary}>{r.description}</MandiText> : null}
        </MandiCard>
      ))}
      <MandiText variant="label">Where</MandiText>
      <FilterPills
        items={[{ key: WHOLE_BUSINESS, label: 'Whole business' },
          ...places.map((p) => ({ key: String(p.id), label: p.name }))]}
        selected={place}
        onSelect={setPlace}
      />
      <MandiText variant="caption" color={Colors.textTertiary}>
        {place === WHOLE_BUSINESS ? `Every ${placeLabel}, including ones added later.` : `Only this ${placeLabel}.`}
      </MandiText>
    </View>
  );
}

function InviteSheet({ side, orgId, places, placeLabel, onClose }: {
  side: Side; orgId: number | null; places: TeamPlace[]; placeLabel: string; onClose: () => void;
}) {
  const invite = useInvite(orgId);
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [place, setPlace] = useState(places.length === 1 ? String(places[0]!.id) : WHOLE_BUSINESS);
  const [error, setError] = useState<string | null>(null);
  const valid = phone.replace(/\D/g, '').length >= 10 && role != null;

  const submit = () => {
    if (!role) return;
    setError(null);
    invite.mutate({ phone, name, role, outletId: place === WHOLE_BUSINESS ? null : Number(place) }, {
      onSuccess: () => { toast.show('Invitation sent'); onClose(); },
      onError: (e) => setError(message(e)),
    });
  };

  return (
    <MandiBottomSheet visible title="Invite someone" onClose={onClose} avoidKeyboard>
      <View style={styles.section}>
        <MandiFormField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
          prefix="+91" maxLength={14} required />
        <MandiFormField label="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={150}
          hint="Shown on the team until they set their own." />
        <RoleAndPlace side={side} orgId={orgId} places={places} placeLabel={placeLabel}
          role={role} setRole={setRole} place={place} setPlace={setPlace} />
        {error && <MandiText variant="caption" color={Colors.danger}>{error}</MandiText>}
        <MandiButton label="Send invitation" onPress={submit} disabled={!valid} loading={invite.isPending} fullWidth />
      </View>
    </MandiBottomSheet>
  );
}

function MemberSheet({ side, orgId, member, places, placeLabel, isSelf, onClose }: {
  side: Side; orgId: number | null; member: Member; places: TeamPlace[]; placeLabel: string; isSelf: boolean;
  onClose: () => void;
}) {
  const change = useChangeRole(orgId);
  const remove = useRemoveMember(orgId);
  const toast = useToast();
  const current = roleGrant(member);
  const roles = useAssignableRoles(orgId);
  const owner = current?.template === 'OWNER';
  const [role, setRole] = useState<Role | null>(null);
  const [place, setPlace] = useState(current && current.scopeType === 'OUTLET' ? String(current.scopeId) : WHOLE_BUSINESS);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = role ?? roles.data.find((r) => r.id === current?.roleId) ?? null;

  const save = () => {
    if (!chosen) return;
    setError(null);
    change.mutate({ member, role: chosen, outletId: place === WHOLE_BUSINESS ? null : Number(place) }, {
      onSuccess: () => { toast.show('Access updated'); onClose(); },
      onError: (e) => setError(message(e)),
    });
  };

  const removeMember = () => {
    setError(null);
    remove.mutate(member.membershipId, {
      onSuccess: () => { toast.show('Removed from the team'); onClose(); },
      onError: (e) => setError(message(e)),
    });
  };

  return (
    <MandiBottomSheet visible title={member.name || member.phone || 'Team member'} onClose={onClose}>
      <View style={styles.section}>
        {member.phone && <MandiText variant="caption" color={Colors.textSecondary}>{member.phone}</MandiText>}
        {owner || isSelf ? (
          <MandiText variant="body" color={Colors.textSecondary}>
            {owner ? 'The owner\'s access comes with the business and can\'t be changed here.'
              : 'Ask another admin to change your own access.'}
          </MandiText>
        ) : (
          <>
            <RoleAndPlace side={side} orgId={orgId} places={places} placeLabel={placeLabel}
              role={chosen} setRole={setRole} place={place} setPlace={setPlace} />
            <MandiButton label="Save access" onPress={save} disabled={!chosen} loading={change.isPending} fullWidth />
            {confirmRemove ? (
              <View style={styles.section}>
                <MandiText variant="body">
                  Remove {member.name || 'them'} from the business? They lose access here and in Costonomy&apos;s other apps.
                </MandiText>
                <MandiButton label="Remove" variant="destructive" onPress={removeMember} loading={remove.isPending} fullWidth />
                <MandiButton label="Keep" variant="tertiary" onPress={() => setConfirmRemove(false)} fullWidth />
              </View>
            ) : (
              <MandiButton label="Remove from team" variant="tertiary" onPress={() => setConfirmRemove(true)} fullWidth />
            )}
          </>
        )}
        {error && <MandiText variant="caption" color={Colors.danger}>{error}</MandiText>}
      </View>
    </MandiBottomSheet>
  );
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
  section: { gap: Spacing.md },
});
