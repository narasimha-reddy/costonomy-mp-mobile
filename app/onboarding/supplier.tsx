import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import { createSupplier, submitVerification } from '@/services/onboarding';
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

const SCREEN = 'SUP-ONB-01';
const STEPS = ['Your business', 'Your first store', 'Verification'];

/** 2 state digits, 10 PAN, 1 entity, Z, 1 checksum. The server enforces this too. */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * What counts as a contact number, matching the server's rule. D-097.
 *
 * <p>Loose on purpose: digits, spaces, dashes and brackets, seven to fifteen
 * digits. This is a number somebody dials, not an identity — the strict rule
 * belongs on the login phone, and applying it here would reject the landline
 * with an STD code that a warehouse counter actually answers.
 */
const PHONE = /^[+]?[0-9 ()-]{7,20}$/;

/**
 * SUP-ONB-01 and SUP-ONB-02. Doc 05 §23.
 *
 * <p><b>Verification is part of registration, not a task for later.</b> A
 * supplier cannot trade until a GST verification is reviewed — `canTrade` stays
 * false and no restaurant sees their catalog. Leaving it to a settings screen
 * would let someone list a hundred SKUs and then wonder why nothing ever sells.
 *
 * <p>The verification is submitted after the organisation exists, because it
 * belongs to it. If that second call fails the supplier is still created and
 * usable for catalog work — so the screen routes on regardless and says what is
 * still outstanding, rather than stranding a registration halfway.
 */
export default function SupplierOnboardingScreen() {
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
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstin, setGstin] = useState('');

  /**
   * Who to ring, at the business and at the branch. D-097.
   *
   * <p>The business contact seeds the store's, and the store's is held
   * separately from the moment it is touched: a supplier with three branches
   * has three people on three counters, and copying is a convenience rather
   * than a claim that they are the same person.
   *
   * <p>The signed-in phone is the starting point for both, because it is the
   * number we already know reaches them. Registration used to use it silently
   * for both and never ask for a name, which is how every seeded store ended
   * up with a number and nobody to ask for.
   */
  const [contactName, setContactName] = useState('');
  // Null means untouched, so the signed-in number can arrive late. Seeding
  // `useState` with it captured whatever `me` was on the first render — which
  // is null while the session is still loading, leaving the field empty and
  // the step permanently invalid.
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [storeContactName, setStoreContactName] = useState<string | null>(null);
  const [storeContactPhone, setStoreContactPhone] = useState<string | null>(null);

  // Null means "not edited", so the copy keeps following the business contact
  // until somebody types over it.
  const contactPhoneValue = contactPhone ?? me?.user.phone ?? '';
  const storeContactNameValue = storeContactName ?? contactName;
  const storeContactPhoneValue = storeContactPhone ?? contactPhoneValue;

  const register = useMutation({
    mutationFn: async () => {
      const supplier = await createSupplier(accessToken as string, {
        legalName: legalName.trim() || displayName.trim(),
        displayName: displayName.trim(),
        gstin: gstin.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhoneValue.trim(),
        firstStore: {
          name: storeName.trim(),
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim() || undefined,
          latitude: pin?.latitude,
          longitude: pin?.longitude,
          contactName: storeContactNameValue.trim(),
          contactPhone: storeContactPhoneValue.trim(),
        },
      });

      let verificationSubmitted = true;
      try {
        await submitVerification(accessToken as string, supplier.id, {
          verificationType: 'GST',
          gstin: gstin.trim(),
          legalName: legalName.trim() || displayName.trim(),
        });
      } catch {
        // The organisation exists and the person can work on their catalog.
        // Stranding them here would be worse than telling them what is left.
        verificationSubmitted = false;
      }
      return { supplier, verificationSubmitted };
    },
    onSuccess: async ({ supplier, verificationSubmitted }) => {
      track('supplier_registered', { screen: SCREEN, entityId: supplier.id },
        { verificationSubmitted, located: pin != null });
      await reload();
      toast.show(
        verificationSubmitted
          ? 'Registered — verification is with our team'
          : 'Registered. Submit your GST details from More to start trading.',
        verificationSubmitted ? 'success' : 'info',
      );
      router.replace('/supplier');
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not register your business.',
        'error',
      ),
  });

  const stepValid = useMemo(() => {
    if (step === 0) {
      return displayName.trim().length > 1
        && contactName.trim().length > 1
        && PHONE.test(contactPhoneValue.trim());
    }
    if (step === 1) {
      return storeName.trim().length > 1
        && addressLine1.trim().length > 2
        && city.trim().length > 1
        && state.trim().length > 1
        && storeContactNameValue.trim().length > 1
        && PHONE.test(storeContactPhoneValue.trim());
    }
    return GSTIN.test(gstin.trim());
  }, [step, displayName, contactName, contactPhoneValue, storeName, addressLine1, city, state,
    storeContactNameValue, storeContactPhoneValue, gstin]);

  const gstinTouched = gstin.trim().length > 0;

  return (
    <MandiScreen
      header={<MandiHeader title="Set up your business" back onBack={() => (step === 0 ? router.back() : setStep(step - 1))} />}
      footer={
        <MandiStickyBar>
          <MandiButton
            label={step === 2 ? 'Register and submit' : 'Continue'}
            size="lg"
            disabled={!stepValid}
            loading={register.isPending}
            onPress={() => (step === 2 ? register.mutate() : setStep(step + 1))}
          />
        </MandiStickyBar>
      }
    >
      <MandiStepBar step={step + 1} total={STEPS.length} label={STEPS[step] as string} />

      {step === 0 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">Who are you?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              The name restaurants will see when they compare suppliers.
            </MandiText>
          </View>

          <MandiFormField
            label="Business name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Metro Fresh Supplies"
            required
          />
          <MandiFormField
            label="Registered legal name (optional)"
            value={legalName}
            onChangeText={setLegalName}
            placeholder="Metro Fresh Supplies Pvt Ltd"
            hint="Used on invoices and for verification. Defaults to the name above."
          />

          <MandiFormField
            label="Contact name"
            value={contactName}
            onChangeText={setContactName}
            placeholder="Ramesh Kumar"
            required
            hint="Who we and our operations team ask for."
          />
          <MandiFormField
            label="Contact number"
            value={contactPhoneValue}
            onChangeText={setContactPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            required
          />
        </>
      )}

      {step === 1 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">Where do you ship from?</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              Your first store. Delivery is quoted by distance from here, so pinning it
              decides which restaurants can buy from you.
            </MandiText>
          </View>

          <MandiFormField
            label="Store name"
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Koramangala warehouse"
            required
          />
          <MandiFormField
            label="Address"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="80 Feet Road"
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
            placeholder="560034"
            keyboardType="number-pad"
          />

          {/* Copied from the business, and editable. A restaurant chasing a
              delivery rings the branch, not head office. */}
          <MandiFormField
            label="Contact name at this store"
            value={storeContactNameValue}
            onChangeText={setStoreContactName}
            placeholder="Ramesh Kumar"
            required
            hint="Copied from your business contact. Change it if someone else runs this store."
          />
          <MandiFormField
            label="Contact number at this store"
            value={storeContactPhoneValue}
            onChangeText={setStoreContactPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            required
          />

          {/* The map is part of registering: a store pinned wrong here is one
              nobody can quote delivery to, and the person who would notice is
              standing right there. */}
          <MandiLocationField
            state={pin ? 'ready' : location.state}
            coordinates={pin}
            onCapture={location.capture}
            onCoordinatesChange={setPicked}
            subject="store"
          />
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.intro}>
            <MandiText variant="display">Let&rsquo;s verify you</MandiText>
            <MandiText variant="bodyRelaxed" color={Colors.textSecondary}>
              Restaurants only see verified suppliers. We check your GSTIN against the
              legal name you gave us.
            </MandiText>
          </View>

          <MandiFormField
            label="GSTIN"
            value={gstin}
            onChangeText={(text) => setGstin(text.toUpperCase().replace(/\s/g, '').slice(0, 15))}
            placeholder="29ABCDE1234F1Z5"
            autoCapitalize="characters"
            required
            error={gstinTouched && !GSTIN.test(gstin.trim())
              ? 'That is not a valid GSTIN. It is 15 characters.'
              : undefined}
            hint="15 characters: state code, PAN, entity, Z, checksum."
          />

          <MandiCard>
            <Line label="Business" value={displayName.trim()} />
            <Line label="Legal name" value={legalName.trim() || displayName.trim()} />
            <Line label="Store" value={storeName.trim()} />
            <Line
              label="Address"
              value={[addressLine1.trim(), city.trim(), state.trim(), pincode.trim()]
                .filter(Boolean).join(', ')}
            />
            <Line
              label="Pinned"
              value={pin
                ? `${pin.latitude}, ${pin.longitude}`
                : 'Not pinned — restaurants cannot be quoted delivery from here yet'}
              warn={pin == null}
            />
          </MandiCard>

          <View style={styles.note}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.info} />
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
              You can build your catalog straight away. Orders start reaching you once
              verification is approved.
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
