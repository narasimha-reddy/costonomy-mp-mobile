import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import { updateStore, type SupplierStore } from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiFormField,
  MandiHeader,
  MandiLocationField,
  MandiScreen,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'SUP-ONB-01';
const SLA_CHOICES = [60, 300, 900, 1800];

/**
 * Stores: where you ship from, how fast you answer, and whether you are open.
 *
 * <p><b>Going offline is not the same as closing.</b> OFFLINE stops new orders
 * reaching this store while leaving everything in flight alone — which is what a
 * supplier actually wants at 11pm, and what they would otherwise achieve by
 * ignoring orders until they expire, damaging their own acceptance record.
 *
 * <p>The response window is a real per-store setting, and the screen says what it
 * costs: a longer window means a restaurant waits longer before sourcing
 * elsewhere.
 */
export default function StoreSettingsScreen() {
  const { stores } = useStore();

  return (
    <MandiScreen header={<MandiHeader title="Stores" back />}>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Delivery is quoted by distance from a store, so where each one sits decides which
        restaurants can buy from it.
      </MandiText>
      {stores.map((store) => (
        <StoreCard key={store.id} store={store} />
      ))}
    </MandiScreen>
  );
}

function StoreCard({ store }: { store: SupplierStore }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { supplier } = useStore();
  const location = useDeviceLocation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(store.name);
  const [addressLine1, setAddressLine1] = useState(store.addressLine1 ?? '');
  const [prep, setPrep] = useState(String(store.preparationMinutes ?? 60));

  const online = store.status === 'ACTIVE';
  const located = store.latitude != null && store.longitude != null;

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateStore>[2]) =>
      updateStore(accessToken as string, store.id, patch),
    onSuccess: (_data, patch) => {
      track('store_updated', { screen: SCREEN, entityId: store.id },
        { fields: Object.keys(patch) });
      void queryClient.invalidateQueries({ queryKey: ['supplier', supplier?.id] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-store', store.id] });
      toast.show('Saved', 'success');
      setEditing(false);
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  return (
    <MandiCard>
      <View style={styles.row}>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis">{store.name}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {[store.addressLine1, store.city, store.pincode].filter(Boolean).join(', ')}
          </MandiText>
        </View>
        <MandiStatusChip
          label={online ? 'Open' : 'Offline'}
          tone={online ? 'success' : 'neutral'}
          size="sm"
        />
      </View>

      {!located && (
        <View style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
          <MandiText variant="caption" color={Colors.warning} style={styles.flex}>
            Not pinned. No restaurant can be quoted delivery from this store.
          </MandiText>
        </View>
      )}

      <View style={styles.facts}>
        <Fact
          label="Answer window"
          value={store.responseSlaSeconds
            ? `${Math.round(store.responseSlaSeconds / 60)} min`
            : '—'}
        />
        <Fact
          label="Prep time"
          value={store.preparationMinutes != null ? `${store.preparationMinutes} min` : '—'}
        />
      </View>

      {editing ? (
        <>
          <MandiFormField label="Store name" value={name} onChangeText={setName} required />
          <MandiFormField label="Address" value={addressLine1} onChangeText={setAddressLine1} />
          <MandiFormField
            label="Preparation time (minutes)"
            value={prep}
            onChangeText={(text) => setPrep(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            hint="How long after accepting until it is packed and ready for pickup."
          />

          <View>
            <MandiText variant="label">How long you have to answer an order</MandiText>
            <View style={styles.chips}>
              {SLA_CHOICES.map((seconds) => {
                const active = store.responseSlaSeconds === seconds;
                return (
                  <MandiButton
                    key={seconds}
                    label={seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`}
                    variant={active ? 'primary' : 'secondary'}
                    size="md"
                    fullWidth={false}
                    onPress={() => save.mutate({ responseSlaSeconds: seconds })}
                  />
                );
              })}
            </View>
            <MandiText variant="caption" color={Colors.textTertiary}>
              Longer gives you more time, and makes restaurants wait before sourcing elsewhere.
            </MandiText>
          </View>

          {!located && (
            <MandiLocationField
              state={location.state}
              coordinates={location.coordinates}
              onCapture={location.capture}
              subject="store"
            />
          )}

          <View style={styles.actions}>
            <MandiButton
              label="Save"
              size="md"
              loading={save.isPending}
              onPress={() => save.mutate({
                name: name.trim(),
                addressLine1: addressLine1.trim(),
                preparationMinutes: Number(prep) || undefined,
                latitude: location.coordinates?.latitude,
                longitude: location.coordinates?.longitude,
              })}
              style={styles.flex}
            />
            <MandiButton
              label="Cancel"
              variant="tertiary"
              size="md"
              onPress={() => setEditing(false)}
              style={styles.flex}
            />
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <MandiButton
            label="Edit store"
            variant="secondary"
            size="md"
            onPress={() => setEditing(true)}
            style={styles.flex}
          />
          <MandiButton
            label={online ? 'Go offline' : 'Go online'}
            variant="tertiary"
            size="md"
            loading={save.isPending}
            onPress={() => save.mutate({ status: online ? 'OFFLINE' : 'ACTIVE' })}
            style={styles.flex}
          />
        </View>
      )}

      {!editing && (
        <MandiText variant="caption" color={Colors.textTertiary}>
          {online
            ? 'Going offline stops new orders reaching this store. Anything in flight carries on.'
            : 'This store is not receiving new orders.'}
        </MandiText>
      )}
    </MandiCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis">{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  warn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  facts: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.sm },
  fact: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginVertical: Spacing.xs },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
});
