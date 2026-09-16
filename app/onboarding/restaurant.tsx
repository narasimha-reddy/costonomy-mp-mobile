import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import { createRestaurant } from '@/services/onboarding';
import {
  MandiButton,
  MandiCard,
  MandiFormField,
  MandiHeader,
  MandiLocationField,
  MandiScreen,
  MandiStepBar,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-ONB-01';
const STEPS = ['Your restaurant', 'Your first outlet', 'Confirm'];

/**
 * REST-ONB-01. Doc 05 §4.
 *
 * <p>Three steps, because two of them are about different things — the business
 * and the place — and a single long form is how a restaurant owner abandons
 * setup on a phone.
 *
 * <p><b>The outlet is not optional.</b> A restaurant with no outlet cannot order:
 * carts, requirements, credit and delivery all belong to an outlet. The API takes
 * both in one call for the same reason, so there is no window in which a
 * half-made restaurant exists.
 */
export default function RestaurantOnboardingScreen() {
  const router = useRouter();
  const toast = useToast();
  const { accessToken, reload, me } = useSession();
  const location = useDeviceLocation();
  // Whatever the map or the coordinate fields last produced. The device hook is
  // only one of three ways to answer, so it cannot be the only thing submitted.
  const [picked, setPicked] = useState<{ latitude: string; longitude: string } | null>(null);
  /** Pinned by any of the three routes: the map, the device, or typed coordinates. */
  const pin = picked ?? location.coordinates;

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [outletName, setOutletName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createRestaurant(accessToken as string, {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        gstin: gstin.trim() || undefined,
        firstOutlet: {
          name: outletName.trim(),
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim() || undefined,
          latitude: pin?.latitude,
          longitude: pin?.longitude,
          contactPhone: me?.user.phone ?? undefined,
        },
      }),
    onSuccess: async (restaurant) => {
      track('restaurant_registered', { screen: SCREEN, entityId: restaurant.id },
        { located: pin != null });
      // The server now says this user is a restaurant owner. Re-read before
      // routing: `audience` comes from memberships, never from what we just did.
      await reload();
      toast.show(`${restaurant.name} is ready`, 'success');
      router.replace('/restaurant');
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not create your restaurant.',
        'error',
      ),
  });

  const stepValid = useMemo(() => {
    if (step === 0) return name.trim().length > 1;
    if (step === 1) {
      return outletName.trim().length > 1
        && addressLine1.trim().length > 2
        && city.trim().length > 1
        && state.trim().length > 1;
    }
    return true;
  }, [step, name, outletName, addressLine1, city, state]);

  return (
    <MandiScreen
      header={<MandiHeader title="Set up your restaurant" back onBack={() => (step === 0 ? router.back() : setStep(step - 1))} />}
      footer={
        <MandiStickyBar>
          <MandiButton
            label={step === 2 ? 'Create restaurant' : 'Continue'}
            size="lg"
            disabled={!stepValid}
            loading={create.isPending}
            onPress={() => (step === 2 ? create.mutate() : setStep(step + 1))}
          />
        </MandiStickyBar>
      }
    >
      <MandiStepBar step={step + 1} total={STEPS.length} label={STEPS[step] as string} />

      {step === 0 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">What is it called?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              The name your suppliers will see on every order.
            </MandiText>
          </View>

          <MandiFormField
            label="Restaurant name"
            value={name}
            onChangeText={setName}
            placeholder="Spice Garden"
            required
          />
          <MandiFormField
            label="Registered legal name (optional)"
            value={legalName}
            onChangeText={setLegalName}
            placeholder="Spice Garden Foods Pvt Ltd"
            hint="Only if it differs from the name above."
          />
          <MandiFormField
            label="GSTIN (optional)"
            value={gstin}
            onChangeText={(text) => setGstin(text.toUpperCase().replace(/\s/g, ''))}
            placeholder="29ABCDE1234F1Z5"
            autoCapitalize="characters"
            hint="Needed on invoices. You can add it later."
          />
        </>
      )}

      {step === 1 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">Where do we deliver?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              Your first outlet. You can add more kitchens afterwards.
            </MandiText>
          </View>

          <MandiFormField
            label="Outlet name"
            value={outletName}
            onChangeText={setOutletName}
            placeholder="Indiranagar"
            required
            hint="How your team refers to this kitchen."
          />
          <MandiFormField
            label="Address"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="100 Feet Road"
            required
          />
          <View style={styles.row}>
            <MandiFormField
              label="City"
              value={city}
              onChangeText={setCity}
              placeholder="Bengaluru"
              required
              style={styles.flex}
            />
            <MandiFormField
              label="State"
              value={state}
              onChangeText={setState}
              placeholder="Karnataka"
              required
              style={styles.flex}
            />
          </View>
          <MandiFormField
            label="PIN code"
            value={pincode}
            onChangeText={(text) => setPincode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder="560038"
            keyboardType="number-pad"
          />

          {/* The map is part of registering: a outlet pinned wrong here is one
              nobody can quote delivery to, and the person who would notice is
              standing right there. */}
          <MandiLocationField
            state={pin ? 'ready' : location.state}
            coordinates={pin}
            onCapture={location.capture}
            onCoordinatesChange={setPicked}
            subject="outlet"
          />
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">Look right?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              You will be the owner of this restaurant and can invite your team afterwards.
            </MandiText>
          </View>

          <MandiCard>
            <Line label="Restaurant" value={name.trim()} />
            {legalName.trim() !== '' && <Line label="Legal name" value={legalName.trim()} />}
            {gstin.trim() !== '' && <Line label="GSTIN" value={gstin.trim()} />}
          </MandiCard>

          <MandiCard>
            <Line label="Outlet" value={outletName.trim()} />
            <Line
              label="Address"
              value={[addressLine1.trim(), city.trim(), state.trim(), pincode.trim()]
                .filter(Boolean).join(', ')}
            />
            <Line
              label="Pinned"
              value={pin
                ? `${pin.latitude}, ${pin.longitude}`
                : 'Not pinned — delivery cannot be quoted yet'}
              warn={pin == null}
            />
          </MandiCard>

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              Suppliers see this name on every order you place. You can change it later
              from Account.
            </MandiText>
          </View>
        </>
      )}
    </MandiScreen>
  );
}

function Line({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.line}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="body" color={warn ? Colors.warning : undefined}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.md },
  line: { gap: 2, marginTop: Spacing.sm },
  note: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
});
