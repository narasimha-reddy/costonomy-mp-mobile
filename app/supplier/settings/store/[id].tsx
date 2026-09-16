import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import {
  fetchCreditPolicy,
  fetchDeliveryPolicy,
  fetchStore,
  saveCreditPolicy,
  saveDeliveryPolicy,
  updateStore,
  type OperatingHours,
} from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiLocationField,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { OperatingHoursFields } from '@/components/supplier/OperatingHoursFields';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'SUP-ONB-01';

/**
 * One store, in sections.
 *
 * <p>Everything here was previously a single expanding card that edited a name, a
 * street line and a prep time — while the address, the pin, the trading hours and
 * both policies were either unreachable or absent. A supplier could not say when
 * they were open or how they delivered, and the marketplace had no way to know.
 *
 * <p><b>The answer window is not here.</b> It is shown, because a supplier is
 * held to it and a number you are judged by should be visible, but it is set by
 * operations: a supplier who could set their own window could set it to an hour
 * and never be late, and "responds quickly" would stop meaning anything to
 * compare across suppliers.
 */
export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const storeId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { supplier } = useStore();
  const location = useDeviceLocation();

  const store = useQuery({
    queryKey: ['supplier-store', storeId],
    queryFn: () => fetchStore(accessToken as string, storeId),
    enabled: accessToken != null && Number.isFinite(storeId),
  });
  const delivery = useQuery({
    queryKey: ['supplier-store', storeId, 'delivery-policy'],
    queryFn: () => fetchDeliveryPolicy(accessToken as string, storeId),
    enabled: accessToken != null && Number.isFinite(storeId),
  });
  const credit = useQuery({
    queryKey: ['supplier-store', storeId, 'credit-policy'],
    queryFn: () => fetchCreditPolicy(accessToken as string, storeId),
    enabled: accessToken != null && Number.isFinite(storeId),
  });

  const data = store.data;

  // Null means "untouched, use the server's value". Editing every field into
  // state on load would make an unrelated field dirty the moment anything
  // refetched.
  const [name, setName] = useState<string | null>(null);
  const [line1, setLine1] = useState<string | null>(null);
  const [line2, setLine2] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
  const [pincode, setPincode] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [prep, setPrep] = useState<string | null>(null);
  const [hours, setHours] = useState<OperatingHours | null>(null);
  // The pin the screen is editing. Null means untouched — the store's own.
  const [pin, setPin] = useState<{ latitude: string; longitude: string } | null>(null);

  const [own, setOwn] = useState<boolean | null>(null);
  const [partner, setPartner] = useState<boolean | null>(null);
  const [ownFee, setOwnFee] = useState<string | null>(null);
  const [ownMin, setOwnMin] = useState<string | null>(null);
  const [radius, setRadius] = useState<string | null>(null);

  const [creditOn, setCreditOn] = useState<boolean | null>(null);
  const [creditLimit, setCreditLimit] = useState<string | null>(null);
  const [creditDays, setCreditDays] = useState<string | null>(null);
  const [graceDays, setGraceDays] = useState<string | null>(null);

  const nameValue = name ?? data?.name ?? '';
  const line1Value = line1 ?? data?.addressLine1 ?? '';
  const line2Value = line2 ?? data?.addressLine2 ?? '';
  const cityValue = city ?? data?.city ?? '';
  const stateValue = stateName ?? data?.state ?? '';
  const pincodeValue = pincode ?? data?.pincode ?? '';
  const contactNameValue = contactName ?? data?.contactName ?? '';
  const contactPhoneValue = contactPhone ?? data?.contactPhone ?? '';
  const prepValue = prep ?? String(data?.preparationMinutes ?? 60);
  const hoursValue = hours ?? data?.operatingHours
    ?? { days: [], opensAt: '10:00', closesAt: '21:00' };

  // Device capture and typed coordinates feed one value, so whichever the
  // supplier used last is what gets saved.
  const pinValue = pin
    ?? (location.coordinates
      ? { latitude: location.coordinates.latitude, longitude: location.coordinates.longitude }
      : data?.latitude != null && data?.longitude != null
        ? { latitude: String(data.latitude), longitude: String(data.longitude) }
        : null);

  const ownValue = own ?? delivery.data?.ownDeliveryEnabled ?? false;
  const partnerValue = partner ?? delivery.data?.costonomyDeliveryEnabled ?? true;
  const ownFeeValue = ownFee ?? (delivery.data?.ownDeliveryFee != null
    ? String(Number(delivery.data.ownDeliveryFee)) : '');
  const ownMinValue = ownMin ?? (delivery.data?.ownDeliveryMinOrderValue != null
    ? String(Number(delivery.data.ownDeliveryMinOrderValue)) : '');
  const radiusValue = radius ?? (delivery.data?.maxDeliveryRadiusKm != null
    ? String(Number(delivery.data.maxDeliveryRadiusKm)) : '');

  const creditOnValue = creditOn ?? credit.data?.creditEnabled ?? false;
  const creditLimitValue = creditLimit ?? (credit.data?.defaultCreditLimit != null
    ? String(Number(credit.data.defaultCreditLimit)) : '');
  const creditDaysValue = creditDays ?? String(credit.data?.defaultCreditPeriodDays ?? 30);
  const graceDaysValue = graceDays ?? String(credit.data?.defaultGracePeriodDays ?? 5);

  const touched = [
    name, line1, line2, city, stateName, pincode, contactName, contactPhone, prep, hours, pin,
    own, partner, ownFee, ownMin, radius,
    creditOn, creditLimit, creditDays, graceDays,
  ].some((value) => value !== null) || location.coordinates != null;

  const online = data?.status === 'ACTIVE';

  // Changed is not saveable. The server refuses each of these, and a button that
  // offers an action it cannot complete is worse than one that waits.
  const problem = nameValue.trim().length < 2 ? 'Enter a store name.'
    : line1Value.trim() === '' ? 'Enter the street address.'
    : cityValue.trim() === '' ? 'Enter the city.'
    : hoursValue.days.length === 0 ? 'Choose at least one day you trade on.'
    : !ownValue && !partnerValue ? 'Choose at least one way to deliver.'
    : null;

  const save = useMutation({
    mutationFn: async () => {
      await updateStore(accessToken as string, storeId, {
        name: nameValue.trim(),
        addressLine1: line1Value.trim(),
        addressLine2: line2Value.trim(),
        city: cityValue.trim(),
        state: stateValue.trim(),
        pincode: pincodeValue.trim(),
        contactName: contactNameValue.trim(),
        contactPhone: contactPhoneValue.trim(),
        operatingHours: hoursValue,
        preparationMinutes: Number(prepValue) || 0,
        ...(pinValue && pinValue.latitude !== '' && pinValue.longitude !== ''
          ? { latitude: pinValue.latitude, longitude: pinValue.longitude }
          : {}),
      });

      await saveDeliveryPolicy(accessToken as string, storeId, {
        ownDeliveryEnabled: ownValue,
        costonomyDeliveryEnabled: partnerValue,
        ownDeliveryFee: ownFeeValue.trim() || '0',
        ownDeliveryMinOrderValue: ownMinValue.trim() || null,
        maxDeliveryRadiusKm: radiusValue.trim() || null,
      });

      await saveCreditPolicy(accessToken as string, storeId, {
        creditEnabled: creditOnValue,
        defaultCreditLimit: creditLimitValue.trim() || null,
        defaultCreditPeriodDays: Number(creditDaysValue) || null,
        defaultGracePeriodDays: Number(graceDaysValue) || null,
      });
    },
    onSuccess: () => {
      track('store_updated', { screen: SCREEN, entityId: storeId });
      void queryClient.invalidateQueries({ queryKey: ['supplier-store', storeId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', supplier?.id] });
      reset();
      toast.show('Saved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  const goOffline = useMutation({
    mutationFn: (next: 'ACTIVE' | 'OFFLINE') =>
      updateStore(accessToken as string, storeId, { status: next }),
    onSuccess: (_d, next) => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-store', storeId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', supplier?.id] });
      toast.show(next === 'ACTIVE' ? 'Store is open' : 'Store is offline', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not change that.', 'error'),
  });

  function reset() {
    setName(null); setLine1(null); setLine2(null); setCity(null); setStateName(null);
    setPincode(null); setContactName(null); setContactPhone(null); setPrep(null); setHours(null);
    setOwn(null); setPartner(null); setOwnFee(null); setOwnMin(null); setRadius(null);
    setCreditOn(null); setCreditLimit(null); setCreditDays(null); setGraceDays(null);
    setPin(null);
  }

  return (
    <MandiScreen
      header={<MandiHeader title={data?.name ?? 'Store'} subtitle={data?.city ?? undefined} back />}
      footer={
        // Always there, disabled until there is something to save. A form whose
        // save button appears only once you have typed gives no sign it saves.
        data != null ? (
          <MandiStickyBar>
            {problem && touched ? (
              <MandiText variant="caption" color={Colors.textSecondary} center>{problem}</MandiText>
            ) : null}
            <View style={styles.footerRow}>
              <MandiButton
                label="Cancel"
                variant="neutral"
                size="lg"
                disabled={!touched || save.isPending}
                onPress={reset}
                style={styles.flex}
              />
              <MandiButton
                label="Save changes"
                size="lg"
                disabled={!touched || problem != null}
                loading={save.isPending}
                onPress={() => save.mutate()}
                style={styles.flex}
              />
            </View>
          </MandiStickyBar>
        ) : undefined
      }
    >
      {store.isPending ? (
        <MandiSkeletonList count={4} />
      ) : store.error || data == null ? (
        <MandiErrorState message="Couldn't load this store." onRetry={() => store.refetch()} />
      ) : (
        <>
          <Section title="Trading now">
            <View style={styles.row}>
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis">
                  {online ? 'Open for orders' : 'Offline'}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {online
                    ? 'Restaurants can order from you inside your trading hours.'
                    : 'No new orders reach this store. Orders already placed are unaffected.'}
                </MandiText>
              </View>
              <MandiStatusChip
                label={online ? 'Open' : 'Offline'}
                tone={online ? 'success' : 'neutral'}
                size="sm"
              />
            </View>
            <MandiButton
              label={online ? 'Go offline' : 'Go online'}
              variant="neutral"
              size="sm"
              icon={online ? 'pause-outline' : 'play-outline'}
              loading={goOffline.isPending}
              onPress={() => goOffline.mutate(online ? 'OFFLINE' : 'ACTIVE')}
              fullWidth={false}
            />
          </Section>

          <Section title="Where you ship from">
            <MandiFormField label="Store name" value={nameValue} onChangeText={setName} required />
            <MandiFormField
              label="Address"
              value={line1Value}
              onChangeText={setLine1}
              required
            />
            <MandiFormField
              label="Area or landmark (optional)"
              value={line2Value}
              onChangeText={setLine2}
            />
            <View style={styles.pair}>
              <MandiFormField
                label="City"
                value={cityValue}
                onChangeText={setCity}
                required
                style={styles.flex}
              />
              <MandiFormField
                label="PIN code"
                value={pincodeValue}
                onChangeText={(text) => setPincode(text.replace(/[^\d]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                style={styles.flex}
              />
            </View>
            <MandiFormField label="State" value={stateValue} onChangeText={setStateName} />

            {/* The pin, not the address, is what delivery is quoted from — an
                address that geocodes badly is a store no restaurant can reach. */}
            <MandiLocationField
              state={pinValue ? 'ready' : location.state}
              coordinates={pinValue}
              onCapture={location.capture}
              onCoordinatesChange={setPin}
              subject="store"
            />
          </Section>

          <Section title="When you trade">
            <OperatingHoursFields
              value={hoursValue}
              onChange={setHours}
            />
            <MandiFormField
              label="Preparation time (minutes)"
              value={prepValue}
              onChangeText={(text) => setPrep(text.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              hint="Used for the delivery estimate a restaurant sees."
            />
            <ReadOnlyFact
              label="Answer window"
              value={`${Math.round((data.responseSlaSeconds ?? 60) / 60)} min`}
              hint="Set by Costonomy operations, so it means the same across every supplier."
            />
          </Section>

          <Section title="How you deliver">
            <Toggle
              label="Costonomy delivery"
              hint="We find and pay a courier, and quote the restaurant one fee."
              value={partnerValue}
              onValueChange={setPartner}
            />
            <Toggle
              label="Your own delivery"
              hint="You carry it yourself and set the fee."
              value={ownValue}
              onValueChange={setOwn}
            />
            {ownValue ? (
              <>
                <View style={styles.pair}>
                  <MandiFormField
                    label="Your delivery fee"
                    value={ownFeeValue}
                    onChangeText={(text) => setOwnFee(text.replace(/[^\d.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    style={styles.flex}
                  />
                  <MandiFormField
                    label="Minimum order"
                    value={ownMinValue}
                    onChangeText={(text) => setOwnMin(text.replace(/[^\d.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="None"
                    style={styles.flex}
                  />
                </View>
                <MandiFormField
                  label="How far you will go (km)"
                  value={radiusValue}
                  onChangeText={(text) => setRadius(text.replace(/[^\d.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="No limit"
                  hint="Restaurants beyond this will not see you."
                />
              </>
            ) : null}
          </Section>

          <Section title="Credit you offer">
            <Toggle
              label="Offer credit"
              hint="Restaurants can ask to buy now and pay later. The money is yours, so the terms are too."
              value={creditOnValue}
              onValueChange={setCreditOn}
            />
            {creditOnValue ? (
              <>
                <MandiFormField
                  label="Limit you usually approve"
                  value={creditLimitValue}
                  onChangeText={(text) => setCreditLimit(text.replace(/[^\d.]/g, ''))}
                  keyboardType="decimal-pad"
                  hint="A starting point when you answer a request, not a promise."
                />
                <View style={styles.pair}>
                  <MandiFormField
                    label="Payment period (days)"
                    value={creditDaysValue}
                    onChangeText={(text) => setCreditDays(text.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    style={styles.flex}
                  />
                  <MandiFormField
                    label="Grace (days)"
                    value={graceDaysValue}
                    onChangeText={(text) => setGraceDays(text.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    style={styles.flex}
                  />
                </View>
              </>
            ) : null}
            <MandiText variant="caption" color={Colors.textTertiary}>
              Turning credit off stops new requests. Agreements you have already granted keep
              working — they are commitments you made.
            </MandiText>
          </Section>
        </>
      )}
    </MandiScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <MandiText variant="label">{title}</MandiText>
      <MandiCard>{children}</MandiCard>
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={`${label}. ${hint}`}
      style={styles.row}
    >
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{label}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{hint}</MandiText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: Colors.primary, false: Colors.borderStrong }}
      />
    </Pressable>
  );
}

function ReadOnlyFact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.readOnly}>
      <View style={styles.row}>
        <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>{label}</MandiText>
        <MandiText variant="bodyEmphasis">{value}</MandiText>
        <Ionicons name="lock-closed-outline" size={14} color={Colors.textTertiary} />
      </View>
      <MandiText variant="caption" color={Colors.textTertiary}>{hint}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pair: { flexDirection: 'row', gap: Spacing.md },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
  readOnly: {
    gap: 2,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
});
