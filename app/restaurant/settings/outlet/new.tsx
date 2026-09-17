import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import { createOutlet } from '@/services/restaurant';
import {
  EMPTY_OUTLET,
  OutletFields,
  outletIsComplete,
  type OutletDraft,
} from '@/components/restaurant/OutletFields';
import {
  MandiButton,
  MandiEmptyState,
  MandiHeader,
  MandiScreen,
  MandiStickyBar,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';

const SCREEN = 'REST-ACCOUNT-01';

/**
 * A new outlet.
 *
 * <p>Adding one changes the restaurant, not any outlet, so it needs
 * `RESTAURANT_EDIT` — a manager of one branch cannot open another. The list does
 * not offer the button; this refuses the route, because a route can be typed.
 *
 * <p>The new outlet is selected on the way out. Someone who has just described a
 * kitchen means to order for it, and leaving them on the branch they were on
 * before would make the whole thing look like it had not worked.
 */
export default function NewOutletScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet, select } = useOutlet();
  const { canForRestaurant } = usePermissions();
  const location = useDeviceLocation();

  const restaurantId = outlet?.restaurantId ?? null;
  const allowed = canForRestaurant('RESTAURANT_EDIT', restaurantId);

  const [edits, setEdits] = useState<Partial<OutletDraft>>({});
  const draft: OutletDraft = {
    ...EMPTY_OUTLET,
    ...edits,
    coordinates: edits.coordinates ?? location.coordinates ?? null,
  };

  const create = useMutation({
    mutationFn: () =>
      createOutlet(accessToken as string, restaurantId as number, {
        name: draft.name.trim(),
        addressLine1: draft.addressLine1.trim(),
        addressLine2: draft.addressLine2.trim() || undefined,
        landmark: draft.landmark.trim() || undefined,
        city: draft.city.trim(),
        state: draft.state.trim(),
        pincode: draft.pincode.trim() || undefined,
        contactName: draft.contactName.trim() || undefined,
        contactPhone: draft.contactPhone.trim() || undefined,
        deliveryInstructions: draft.deliveryInstructions.trim() || undefined,
        latitude: draft.coordinates?.latitude || undefined,
        longitude: draft.coordinates?.longitude || undefined,
      }),
    onSuccess: async (created) => {
      track('outlet_created', { screen: SCREEN, entityId: created.id });
      // Awaited so the switcher has the new outlet before we select it.
      await queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      select(created.id);
      toast.show(`${created.name} added`, 'success');
      router.replace('/restaurant/settings/outlets');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not add that.', 'error'),
  });

  if (!allowed) {
    return (
      <MandiScreen header={<MandiHeader title="Add an outlet" back />}>
        <MandiEmptyState
          icon="lock-closed-outline"
          title="Only an owner can add an outlet"
          description="A new branch is a change to the restaurant. Ask whoever set it up."
        />
      </MandiScreen>
    );
  }

  return (
    <MandiScreen
      header={<MandiHeader title="Add an outlet" back />}
      footer={
        <MandiStickyBar>
          <MandiButton
            label="Add outlet"
            size="lg"
            disabled={!outletIsComplete(draft)}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        </MandiStickyBar>
      }
    >
      <OutletFields
        draft={draft}
        onChange={(next) => setEdits((current) => ({ ...current, ...next }))}
        locationState={location.state}
        onCaptureLocation={location.capture}
      />
    </MandiScreen>
  );
}
