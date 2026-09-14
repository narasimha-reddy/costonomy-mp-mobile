import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Elevation, Radius, Spacing } from '@/theme';
import {
  MandiBadge,
  MandiButton,
  MandiCard,
  MandiCountBadge,
  MandiCountdown,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiIconButton,
  MandiInlineError,
  MandiPrice,
  MandiPriceChange,
  MandiQuantityStepper,
  MandiRecommendedBadge,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonCard,
  MandiStaleIndicator,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import {
  CreditAgreementStatus,
  DeliveryStatus,
  SupplierOrderStatus,
  resolveStatus,
  type StatusDisplay,
} from '@/models/status';

/**
 * A live gallery of the design system.
 *
 * This exists so a developer can *see* what already exists before building
 * another one. It is a development surface, not a product screen — it has no
 * API dependency and is not part of either navigation tree.
 */
export default function DesignSystemScreen() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState(2);
  const [note, setNote] = useState('');

  // 45 seconds out, so the countdown demo starts calm and walks through the ramp.
  const [demoDeadline] = useState(() => new Date(Date.now() + 45_000).toISOString());
  const [expiredDeadline] = useState(() => new Date(Date.now() - 1_000).toISOString());

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <MandiText variant="title">Mandi design system</MandiText>
          <MandiText variant="caption" muted>
            Every primitive in components/common. Tokens in theme/.
          </MandiText>
        </View>

        <Section title="Typography">
          <MandiCard outlined>
            <MandiText variant="display">Display</MandiText>
            <MandiText variant="title">Title</MandiText>
            <MandiText variant="subtitle">Subtitle</MandiText>
            <MandiText variant="sectionTitle">Section title</MandiText>
            <MandiText variant="body">Body — the default for running text.</MandiText>
            <MandiText variant="bodyEmphasis">Body emphasis</MandiText>
            <MandiText variant="caption" muted>Caption, muted</MandiText>
            <MandiText variant="label" muted>LABEL</MandiText>
          </MandiCard>
        </Section>

        <Section title="Colour tokens">
          <MandiCard outlined>
            <View style={styles.swatches}>
              <Swatch color={Colors.primary} name="primary" />
              <Swatch color={Colors.success} name="success" />
              <Swatch color={Colors.warning} name="warning" />
              <Swatch color={Colors.danger} name="danger" />
              <Swatch color={Colors.info} name="info" />
              <Swatch color={Colors.credit} name="credit" />
              <Swatch color={Colors.deliveryLive} name="deliveryLive" />
              <Swatch color={Colors.stale} name="stale" />
            </View>
          </MandiCard>
        </Section>

        <Section title="Buttons">
          <MandiCard outlined>
            <View style={styles.stack}>
              <MandiButton label="Primary — Proceed to checkout" onPress={() => toast.show('Primary pressed')} />
              <MandiButton label="Secondary" variant="secondary" onPress={() => {}} />
              <MandiButton label="Tertiary" variant="tertiary" onPress={() => {}} />
              <MandiButton label="Destructive — Cancel order" variant="destructive" onPress={() => {}} />
              <MandiButton label="Submitting…" loading onPress={() => {}} />
              <MandiButton label="Disabled" disabled onPress={() => {}} />
              <View style={styles.row}>
                <MandiIconButton icon="notifications-outline" accessibilityLabel="Notifications" onPress={() => {}} />
                <MandiIconButton icon="cart-outline" accessibilityLabel="Cart" onPress={() => {}} background={Colors.primaryLight} color={Colors.primary} />
                <MandiCountBadge count={7} />
                <MandiCountBadge count={132} />
              </View>
            </View>
          </MandiCard>
        </Section>

        <Section title="Money">
          <MandiCard outlined>
            <View style={styles.stack}>
              <MandiPrice amount="1450.0000" size="lg" />
              <MandiPrice amount="410.00" unitSuffix="/ KG" />
              <MandiPrice amount="99000" size="sm" color={Colors.savings} />
              <MandiPriceChange from="410.00" to="438.00" />
              <MandiPriceChange from="410.00" to="395.00" />
              <MandiText variant="caption" muted>
                Figures use tabular numerals, so columns align on the decimal point.
              </MandiText>
            </View>
          </MandiCard>
        </Section>

        <Section title="Status chips">
          <MandiCard outlined>
            <View style={styles.wrap}>
              <Chip status="PENDING_ACCEPTANCE" registry={SupplierOrderStatus} />
              <Chip status="CONFIRMED" registry={SupplierOrderStatus} />
              <Chip status="PARTIALLY_ACCEPTED" registry={SupplierOrderStatus} />
              <Chip status="REJECTED" registry={SupplierOrderStatus} />
              <Chip status="EXPIRED" registry={SupplierOrderStatus} />
              <Chip status="IN_TRANSIT" registry={DeliveryStatus} />
              <Chip status="ACTIVE" registry={CreditAgreementStatus} />
              <Chip status="A_STATE_THIS_BUILD_HAS_NOT_SEEN" registry={SupplierOrderStatus} />
            </View>
            <MandiText variant="caption" muted style={styles.note}>
              Every tone carries an icon as well as a colour — §23A.48 forbids
              colour-only meaning. The last chip shows an unknown backend status
              degrading to readable copy.
            </MandiText>
          </MandiCard>
        </Section>

        <Section title="Badges">
          <MandiCard outlined>
            <View style={styles.wrap}>
              <MandiRecommendedBadge reason="Best value" />
              <MandiRecommendedBadge reason="Fastest" />
              <MandiBadge label="Buy again" icon="repeat" color={Colors.info} backgroundColor={Colors.infoLight} />
              <MandiBadge label="Saves ₹1,240" icon="trending-down" color={Colors.savings} backgroundColor={Colors.savingsLight} />
            </View>
          </MandiCard>
        </Section>

        <Section title="Supplier response countdown">
          <MandiCard outlined>
            <View style={styles.stack}>
              <MandiCountdown deadlineAt={demoDeadline} slaSeconds={60} />
              <MandiCountdown deadlineAt={demoDeadline} slaSeconds={60} size="sm" />
              <MandiCountdown deadlineAt={expiredDeadline} />
              <MandiText variant="caption" muted>
                Recomputed from the server deadline every tick, so it stays correct
                after the app is backgrounded. Never driven by the device clock.
              </MandiText>
            </View>
          </MandiCard>
        </Section>

        <Section title="Inputs">
          <MandiCard outlined>
            <View style={styles.stack}>
              <MandiSearchBar value={query} onChangeText={setQuery} />
              <MandiQuantityStepper value={quantity} onChange={setQuantity} unit="KG" itemLabel="Paneer" />
              <MandiQuantityStepper value={quantity} onChange={setQuantity} unit="KG" editable max={20} />
              <MandiFormField
                label="Mobile number"
                value={note}
                onChangeText={setNote}
                prefix="+91"
                keyboardType="phone-pad"
                required
                hint="We'll send a 6-digit code"
              />
              <MandiFormField
                label="GSTIN"
                value=""
                onChangeText={() => {}}
                error="This GSTIN is already registered to another supplier."
              />
            </View>
          </MandiCard>
        </Section>

        <Section title="Loading, empty, error, stale">
          <View style={styles.stack}>
            <MandiSkeletonCard />
            <MandiCard outlined>
              <MandiStaleIndicator label="Location last updated 4 min ago" />
            </MandiCard>
            <MandiInlineError message="Couldn't load recommendations." onRetry={() => {}} />
            <MandiCard outlined style={styles.stateBox}>
              <MandiEmptyState
                icon="clipboard-outline"
                title="No open requirements"
                description="Requirements you add — or that Mandi recommends — will appear here."
                actionLabel="Add requirement"
                onAction={() => toast.show('Add requirement')}
              />
            </MandiCard>
            <MandiCard outlined style={styles.stateBox}>
              <MandiErrorState
                message="We couldn't reach Mandi just now."
                onRetry={() => {}}
                requestId="req_8f21c0"
              />
            </MandiCard>
          </View>
        </Section>

        <Section title="Toast">
          <MandiCard outlined>
            <View style={styles.stack}>
              <MandiButton label="Success toast" variant="secondary" onPress={() => toast.show('Added to cart', 'success')} />
              <MandiButton label="Error toast" variant="secondary" onPress={() => toast.show("Couldn't save draft", 'error')} />
              <MandiText variant="caption" muted>
                Toasts are for reversible, low-stakes feedback only. An order,
                payment or acceptance is confirmed by the state the server returns.
              </MandiText>
            </View>
          </MandiCard>
        </Section>

        <Section title="Elevation">
          <MandiCard outlined>
            <View style={styles.wrap}>
              {(['card', 'raised', 'modal', 'floating'] as const).map((token) => (
                <View key={token} style={[styles.elevationBox, Elevation[token]]}>
                  <MandiText variant="label" muted>{token}</MandiText>
                </View>
              ))}
            </View>
          </MandiCard>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <MandiSectionHeader title={title} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Chip({
  status,
  registry,
}: {
  status: string;
  registry: Record<string, StatusDisplay>;
}) {
  const { label, tone } = resolveStatus(registry, status);
  return <MandiStatusChip label={label} tone={tone} />;
}

function Swatch({ color, name }: { color: string; name: string }) {
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchChip, { backgroundColor: color }]} />
      <MandiText variant="caption" muted>{name}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.huge },
  header: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  section: { marginBottom: Spacing.sectionGap },
  sectionBody: { paddingHorizontal: Spacing.screenHorizontal, gap: Spacing.listGap },
  stack: { gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, alignItems: 'center' },
  note: { marginTop: Spacing.md },
  stateBox: { height: 320 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  swatch: { alignItems: 'center', gap: Spacing.xs, width: 76 },
  swatchChip: { width: 48, height: 48, borderRadius: Radius.md },
  elevationBox: {
    width: 76,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
