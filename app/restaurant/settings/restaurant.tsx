import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchRestaurant, updateRestaurant } from '@/services/restaurant';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
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
 * The restaurant itself — its name, the company behind it, and its GSTIN.
 *
 * <p>Only three fields, and that is the point: everything else about a restaurant
 * belongs to one of its outlets, which is where deliveries go and where people
 * are granted access. A screen that mixed the two would invite editing the
 * company's address.
 *
 * <p><b>Read-only without `RESTAURANT_EDIT`.</b> A manager assigned to one outlet
 * can see whose restaurant it is and cannot rename it. The server would refuse
 * them anyway (doc 09 §2); this is so they are not offered a save button that
 * only ever fails.
 */
export default function RestaurantSettingsScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForRestaurant } = usePermissions();

  const restaurantId = outlet?.restaurantId ?? null;
  const editable = canForRestaurant('RESTAURANT_EDIT', restaurantId);
  // Viewing and editing are separate grants, and a store manager has neither:
  // the server answers 404 rather than 403 so ids cannot be enumerated, which
  // would reach this screen as "something went wrong" — true but useless.
  const visible = canForRestaurant('RESTAURANT_VIEW', restaurantId);

  const query = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => fetchRestaurant(restaurantId as number, accessToken as string),
    enabled: visible && restaurantId != null && accessToken != null,
  });

  const restaurant = query.data;

  const [name, setName] = useState<string | null>(null);
  const [legalName, setLegalName] = useState<string | null>(null);
  const [gstin, setGstin] = useState<string | null>(null);

  const nameValue = name ?? restaurant?.name ?? '';
  const legalValue = legalName ?? restaurant?.legalName ?? '';
  const gstinValue = gstin ?? restaurant?.gstin ?? '';

  const save = useMutation({
    mutationFn: () =>
      updateRestaurant(accessToken as string, restaurantId as number, {
        name: nameValue.trim(),
        legalName: legalValue.trim() || undefined,
        gstin: gstinValue.trim().toUpperCase() || undefined,
      }),
    onSuccess: (updated) => {
      track('restaurant_updated', { screen: SCREEN, entityId: updated.id });
      queryClient.setQueryData(['restaurant', restaurantId], updated);
      void queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
      setName(null);
      setLegalName(null);
      setGstin(null);
      toast.show('Saved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  const dirty = restaurant != null && (
    nameValue.trim() !== restaurant.name
    || legalValue.trim() !== (restaurant.legalName ?? '')
    || gstinValue.trim().toUpperCase() !== (restaurant.gstin ?? '')
  );

  return (
    <MandiScreen
      header={<MandiHeader title="Your restaurant" back />}
      footer={
        editable && dirty ? (
          <MandiStickyBar>
            <MandiButton
              label="Save changes"
              size="lg"
              disabled={nameValue.trim().length < 2}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
          </MandiStickyBar>
        ) : undefined
      }
    >
      {!visible ? (
        <MandiEmptyState
          icon="lock-closed-outline"
          title="This is the owner's to see"
          description="Your access is to an outlet rather than to the restaurant behind it. Everything you order for is under Outlets."
        />
      ) : query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load your restaurant." onRetry={() => query.refetch()} />
      ) : restaurant == null ? (
        <MandiEmptyState
          icon="business-outline"
          title="No restaurant on this account"
          description="You are signed in but not attached to a restaurant yet."
        />
      ) : (
        <>
          <MandiCard>
            <MandiFormField
              label="Restaurant name"
              value={nameValue}
              onChangeText={setName}
              disabled={!editable}
              placeholder="Spice Garden"
              autoCapitalize="words"
            />
            <MandiFormField
              label="Registered company name"
              value={legalValue}
              onChangeText={setLegalName}
              disabled={!editable}
              placeholder="Spice Garden Hospitality Pvt Ltd"
              autoCapitalize="words"
              hint="As it appears on your incorporation documents. Optional."
            />
            <MandiFormField
              label="GSTIN"
              value={gstinValue}
              onChangeText={setGstin}
              disabled={!editable}
              placeholder="29ABCDE1234F1Z5"
              autoCapitalize="characters"
              hint="Suppliers put this on your invoices. Optional."
            />
          </MandiCard>

          {!editable && (
            <View style={styles.note}>
              <MandiText variant="caption" color={Colors.textTertiary}>
                You can see these but not change them. Ask whoever set the restaurant up.
              </MandiText>
            </View>
          )}
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: Spacing.xs },
});
