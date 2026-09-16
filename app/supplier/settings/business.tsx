import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { updateSupplier } from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'SUP-ONB-01';
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Edit the business. Doc 05 §23.
 *
 * <p><b>The GSTIN is shown but not editable here.</b> It is the thing
 * verification was granted against, so changing it silently would leave a
 * verified supplier whose verification refers to a different company. Changing it
 * means verifying again, which is a different screen and a decision worth making
 * deliberately.
 */
export default function BusinessSettingsScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { supplier } = useStore();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [legalName, setLegalName] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);

  const displayValue = displayName ?? supplier?.displayName ?? '';
  const legalValue = legalName ?? supplier?.legalName ?? '';
  const contactValue = contactName ?? '';
  const emailValue = contactEmail ?? '';

  const save = useMutation({
    mutationFn: () =>
      updateSupplier(accessToken as string, supplier?.id as number, {
        displayName: displayValue.trim(),
        legalName: legalValue.trim() || undefined,
        contactName: contactValue.trim() || undefined,
        contactEmail: emailValue.trim() || undefined,
      }),
    onSuccess: () => {
      track('supplier_updated', { screen: SCREEN, entityId: supplier?.id });
      void queryClient.invalidateQueries({ queryKey: ['supplier', supplier?.id] });
      toast.show('Saved', 'success');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not save that.', 'error'),
  });

  const dirty = supplier != null
    && (displayValue.trim() !== supplier.displayName
      || legalValue.trim() !== (supplier.legalName ?? '')
      || contactValue.trim() !== ''
      || emailValue.trim() !== '');

  const validGstin = supplier?.gstin != null && GSTIN.test(supplier.gstin);

  return (
    <MandiScreen
      header={<MandiHeader title="Your business" back />}
      footer={
        dirty ? (
          <MandiStickyBar>
            <MandiButton
              label="Save changes"
              size="lg"
              disabled={displayValue.trim().length < 2}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
          </MandiStickyBar>
        ) : undefined
      }
    >
      {supplier == null ? (
        <MandiErrorState
          title="No business on this account"
          message="You are signed in against a store rather than an organisation, so there is nothing to edit here."
        />
      ) : (
        <>
          <MandiFormField
            label="Business name"
            value={displayValue}
            onChangeText={setDisplayName}
            required
            hint="What restaurants see on every order."
          />
          <MandiFormField
            label="Registered legal name"
            value={legalValue}
            onChangeText={setLegalName}
            hint="Used on invoices and checked during verification."
          />
          <MandiFormField
            label="Contact person"
            value={contactValue}
            onChangeText={setContactName}
            placeholder="Who we call about an order"
          />
          <MandiFormField
            label="Contact email"
            value={emailValue}
            onChangeText={setContactEmail}
            placeholder="orders@yourbusiness.in"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <MandiCard>
            <View style={styles.row}>
              <View style={styles.flex}>
                <MandiText variant="caption" color={Colors.textSecondary}>GSTIN</MandiText>
                <MandiText variant="bodyEmphasis">
                  {supplier.gstin ?? 'Not provided'}
                </MandiText>
              </View>
              <MandiStatusChip
                label={supplier.verificationStatus.replace(/_/g, ' ').toLowerCase()}
                tone={supplier.verificationStatus === 'VERIFIED' ? 'success' : 'pending'}
                size="sm"
              />
            </View>
            <View style={styles.note}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.textTertiary} />
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                {validGstin || supplier.gstin == null
                  ? 'Your verification is tied to this number, so it cannot be edited here. Contact support to change it.'
                  : 'This GSTIN does not look valid. Contact support to correct it.'}
              </MandiText>
            </View>
          </MandiCard>
        </>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  note: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.sm },
});
