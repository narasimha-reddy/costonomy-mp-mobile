import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Coordinates } from '@/hooks/useDeviceLocation';
import {
  MandiCard,
  MandiFormField,
  MandiLocationField,
  MandiSectionHeader,
} from '@/components/common';
import { Spacing } from '@/theme';

/** Everything an outlet is, as the create and edit screens both need it. */
export interface OutletDraft {
  name: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  contactName: string;
  contactPhone: string;
  deliveryInstructions: string;
  coordinates: Coordinates | null;
}

export const EMPTY_OUTLET: OutletDraft = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  contactName: '',
  contactPhone: '',
  deliveryInstructions: '',
  coordinates: null,
};

/** The three things without which an outlet cannot be created. */
export function outletIsComplete(draft: OutletDraft): boolean {
  return draft.name.trim().length >= 2
    && draft.addressLine1.trim().length >= 2
    && draft.city.trim().length >= 2
    && draft.state.trim().length >= 2;
}

/**
 * The form behind both outlet screens.
 *
 * <p>One component because a new outlet and an existing one ask for exactly the
 * same things, and two copies of a fourteen-field form is two places for a field
 * to go missing. The edit screen adds a status control; the create screen does
 * not, because an outlet you are in the middle of creating is not closed.
 *
 * <p>Grouped the way someone answers them: what it is called, where it is, who is
 * there, and what a driver needs to know.
 */
export function OutletFields({
  draft,
  onChange,
  disabled = false,
  locationState,
  onCaptureLocation,
}: {
  draft: OutletDraft;
  onChange: (next: Partial<OutletDraft>) => void;
  disabled?: boolean;
  locationState: 'idle' | 'asking' | 'ready' | 'denied' | 'unavailable';
  onCaptureLocation: () => void;
}) {
  return (
    <>
      <Section title="Name">
        <MandiFormField
          label="Outlet name"
          value={draft.name}
          onChangeText={(name) => onChange({ name })}
          disabled={disabled}
          required
          placeholder="Indiranagar"
          autoCapitalize="words"
          hint="What your team calls this kitchen. Suppliers see it on every order."
        />
      </Section>

      <Section title="Where it is">
        <MandiFormField
          label="Address"
          value={draft.addressLine1}
          onChangeText={(addressLine1) => onChange({ addressLine1 })}
          disabled={disabled}
          required
          placeholder="100 Feet Road"
        />
        <MandiFormField
          label="Area or landmark (optional)"
          value={draft.addressLine2}
          onChangeText={(addressLine2) => onChange({ addressLine2 })}
          disabled={disabled}
        />
        <View style={styles.pair}>
          <MandiFormField
            label="City"
            value={draft.city}
            onChangeText={(city) => onChange({ city })}
            disabled={disabled}
            required
            style={styles.flex}
          />
          <MandiFormField
            label="PIN code"
            value={draft.pincode}
            onChangeText={(text) => onChange({ pincode: text.replace(/[^\d]/g, '').slice(0, 6) })}
            disabled={disabled}
            keyboardType="number-pad"
            style={styles.flex}
          />
        </View>
        <MandiFormField
          label="State"
          value={draft.state}
          onChangeText={(state) => onChange({ state })}
          disabled={disabled}
          required
        />

        {/* The pin, not the address, is what delivery is quoted from — an outlet
            that geocodes badly is one no supplier can price a delivery to. */}
        {!disabled && (
          <MandiLocationField
            state={draft.coordinates ? 'ready' : locationState}
            coordinates={draft.coordinates}
            onCapture={onCaptureLocation}
            onCoordinatesChange={(coordinates) => onChange({ coordinates })}
            subject="outlet"
          />
        )}
      </Section>

      <Section title="Who is there">
        <MandiFormField
          label="Contact name"
          value={draft.contactName}
          onChangeText={(contactName) => onChange({ contactName })}
          disabled={disabled}
          placeholder="Kitchen manager"
          autoCapitalize="words"
        />
        <MandiFormField
          label="Contact number"
          value={draft.contactPhone}
          onChangeText={(text) => onChange({ contactPhone: text.replace(/[^\d+]/g, '') })}
          disabled={disabled}
          keyboardType="phone-pad"
          hint="Who a driver calls when they arrive."
        />
      </Section>

      <Section title="Delivery notes">
        <MandiFormField
          label="Anything a driver should know (optional)"
          value={draft.deliveryInstructions}
          onChangeText={(deliveryInstructions) => onChange({ deliveryInstructions })}
          disabled={disabled}
          multiline
          placeholder="Service entrance at the back, ring the bell twice."
        />
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <MandiSectionHeader title={title} />
      <MandiCard>{children}</MandiCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  pair: { flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
});
