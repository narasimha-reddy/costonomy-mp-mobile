import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import { fetchOutlet, updateOutlet, type Outlet } from '@/services/restaurant';
import {
  EMPTY_OUTLET,
  OutletFields,
  outletIsComplete,
  type OutletDraft,
} from '@/components/restaurant/OutletFields';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-ACCOUNT-01';

/**
 * One outlet, as its restaurant manages it.
 *
 * <p><b>Read-only without `OUTLET_EDIT` on this outlet.</b> Somebody with access
 * to two of a chain's nine branches can open the other seven from the switcher
 * and must not be handed a save button for them. The server refuses regardless,
 * and reports it as a 404 rather than a 403 so branch ids cannot be enumerated
 * (doc 09 §3) — this is only so the refusal never has to happen.
 *
 * <p><b>Closing an outlet is not deleting it.</b> There is no delete: an outlet
 * has orders, invoices and disputes hanging off it, and removing the row would
 * orphan them. Closed means nothing new is ordered for it.
 */
export default function OutletSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const outletId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlets } = useOutlet();
  const { canForOutlet } = usePermissions();
  const location = useDeviceLocation();

  const query = useQuery({
    queryKey: ['outlet', outletId],
    queryFn: () => fetchOutlet(outletId, accessToken as string),
    enabled: Number.isFinite(outletId) && accessToken != null,
    // The switcher already has it; showing it instantly and refreshing behind is
    // better than a skeleton for a screen the list just handed over.
    initialData: () => outlets.find((item) => item.id === outletId),
  });

  const outlet = query.data;
  const editable = canForOutlet('OUTLET_EDIT', outlet ?? null);

  const [edits, setEdits] = useState<Partial<OutletDraft>>({});
  const [status, setStatus] = useState<string | null>(null);

  const saved = useMemo<OutletDraft>(() => (outlet ? toDraft(outlet) : EMPTY_OUTLET), [outlet]);
  const draft: OutletDraft = {
    ...saved,
    ...edits,
    // A device fix counts as a change even though nothing was typed: `capture`
    // reports into the hook rather than returning, so an edit made by pressing
    // "use my current location" would otherwise never reach the draft.
    coordinates: edits.coordinates ?? location.coordinates ?? saved.coordinates,
  };
  const statusValue = status ?? outlet?.status ?? 'ACTIVE';

  const save = useMutation({
    mutationFn: () =>
      updateOutlet(accessToken as string, outletId, {
        name: draft.name.trim(),
        addressLine1: draft.addressLine1.trim(),
        addressLine2: draft.addressLine2.trim(),
        landmark: draft.landmark.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        pincode: draft.pincode.trim(),
        contactName: draft.contactName.trim(),
        contactPhone: draft.contactPhone.trim(),
        deliveryInstructions: draft.deliveryInstructions.trim(),
        latitude: draft.coordinates?.latitude || undefined,
        longitude: draft.coordinates?.longitude || undefined,
        status: statusValue,
      }),
    onSuccess: (updated) => {
      track('outlet_updated', { screen: SCREEN, entityId: updated.id });
      queryClient.setQueryData(['outlet', outletId], updated);
      // The switcher, the header and every screen keyed by outlet read this list.
      void queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId] });
      setEdits({});
      setStatus(null);
      toast.show('Saved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  const dirty = Object.keys(edits).length > 0
    || location.coordinates != null
    || (status != null && status !== outlet?.status);

  return (
    <MandiScreen
      header={<MandiHeader title={outlet?.name ?? 'Outlet'} subtitle={outlet?.city ?? undefined} back />}
      footer={
        editable && dirty ? (
          <MandiStickyBar>
            <MandiButton
              label="Save changes"
              size="lg"
              disabled={!outletIsComplete(draft)}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
          </MandiStickyBar>
        ) : undefined
      }
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        // An outlet you hold no grant on comes back 404, not 403, so that ids
        // cannot be enumerated (doc 09 §3). The copy has to hold that line: "you
        // do not have access" would confirm the outlet exists.
        <MandiEmptyState
          icon="help-circle-outline"
          title="We couldn't find that outlet"
          description="It may have been closed, or it may not be one of yours. Your outlets are under Account."
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : (
        <>
          {!editable && (
            <MandiCard>
              <MandiText variant="caption" color={Colors.textSecondary}>
                You can see this outlet but not change it. Ask an owner, or whoever manages this
                branch.
              </MandiText>
            </MandiCard>
          )}

          <OutletFields
            draft={draft}
            disabled={!editable}
            onChange={(next) => setEdits((current) => ({ ...current, ...next }))}
            locationState={location.state}
            onCaptureLocation={location.capture}
          />

          {editable && (
            <View style={styles.section}>
              <MandiSectionHeader title="Is it open?" />
              <MandiCard>
                <MandiText variant="body">
                  {statusValue === 'ACTIVE'
                    ? 'This outlet is ordering normally.'
                    : 'This outlet is closed. Nothing new can be ordered for it.'}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Closing does not touch orders already placed, and nothing is deleted — an
                  outlet carries its history with it.
                </MandiText>
                <MandiButton
                  label={statusValue === 'ACTIVE' ? 'Close this outlet' : 'Reopen this outlet'}
                  variant="neutral"
                  onPress={() => setStatus(statusValue === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                />
              </MandiCard>
            </View>
          )}
        </>
      )}
    </MandiScreen>
  );
}

function toDraft(outlet: Outlet): OutletDraft {
  return {
    name: outlet.name ?? '',
    addressLine1: outlet.addressLine1 ?? '',
    addressLine2: outlet.addressLine2 ?? '',
    landmark: outlet.landmark ?? '',
    city: outlet.city ?? '',
    state: outlet.state ?? '',
    pincode: outlet.pincode ?? '',
    contactName: outlet.contactName ?? '',
    contactPhone: outlet.contactPhone ?? '',
    deliveryInstructions: outlet.deliveryInstructions ?? '',
    coordinates:
      outlet.latitude != null && outlet.longitude != null
        ? { latitude: String(outlet.latitude), longitude: String(outlet.longitude) }
        : null,
  };
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
});
