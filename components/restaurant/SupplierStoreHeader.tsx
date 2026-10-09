import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  MandiBottomSheet,
  MandiButton,
  MandiText,
} from '@/components/common';
import type { SiblingStore, StorefrontHeader } from '@/models/discovery';
import { formatMoney, formatQuantity } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * Who this supplier is, and whether a kitchen can buy from them.
 *
 * <p><b>The branch is the title and the supplier is beneath it.</b> A kitchen
 * orders from a branch: it is the one with the distance, the shelf and the
 * opening hours. The organisation matters for recognising the name, which is
 * what a subtitle is for.
 *
 * <p><b>Credit is the fact that decides whether they can buy at all</b> on a
 * week when the account is thin, so it gets a line of its own rather than
 * living three taps away on the credit screen. The bar is the only thing here
 * this component computes, and it computes a width, never a rupee — every
 * figure shown is the server's, `available` most of all (§23A.24).
 *
 * <p><b>A rating nobody has given is not four stars.</b> A store with no
 * ratings says so; averaging zero reviews into a number is how a new supplier
 * ends up looking either excellent or terrible for no reason (doc 07 §4).
 */
export function SupplierStoreTitle({
  header,
  fallbackTitle,
  fallbackSubtitle,
  onSwitchStore,
  onMessage,
}: {
  /** Null until it loads. The title bar still renders, from the catalogue. */
  header: StorefrontHeader | null;
  fallbackTitle: string;
  fallbackSubtitle?: string;
  onSwitchStore: (store: SiblingStore) => void;
  /** Open the conversation with this supplier. D-095. */
  onMessage: () => void;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const branches = header?.otherStores.length ?? 0;
  const storeName = header?.storeName ?? fallbackTitle;
  const supplierLine = header?.supplierName ?? fallbackSubtitle ?? null;
  const { title, subtitle } = splitStoreName(storeName, supplierLine);

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
      >
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </Pressable>

      {/* The switcher is the title, as it is on the supplier's own home. One
          branch and there is nothing to switch between, so it is a heading
          rather than a control that does nothing — and the chevron is what says
          which of the two this is, in the place people already look. */}
      <Pressable
        onPress={() => branches > 0 && setSwitching(true)}
        disabled={branches === 0}
        accessibilityRole={branches > 0 ? 'button' : 'header'}
        accessibilityLabel={
          branches > 0
            ? `${title}. Change branch, ${branches} other ${branches === 1 ? 'branch' : 'branches'}`
            : title
        }
        style={styles.titleBlock}
      >
        <View style={styles.titleRow}>
          <MandiText variant="storeTitle" numberOfLines={1} style={styles.flexShrink}>
            {title}
          </MandiText>
          {/* Only a store somebody has rated. "0.0" beside a name reads as a
              bad supplier rather than an unrated one. */}
          {header != null && header.ratingCount > 0 && header.averageRating != null && (
            <View
              style={styles.ratingBadge}
              accessible
              accessibilityLabel={
                `Rated ${formatQuantity(header.averageRating)} from ${header.ratingCount} `
                + `${header.ratingCount === 1 ? 'rating' : 'ratings'}`
              }
            >
              <MandiText variant="captionEmphasis" color={Colors.textInverse}>
                {formatQuantity(header.averageRating)}
              </MandiText>
              <Ionicons name="star" size={IconSize.xs} color={Colors.textInverse} />
            </View>
          )}
          {branches > 0 && (
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          )}
        </View>
        {/* Not the name again: a store that trades under the supplier's own name has nothing more to say here. */}
        {subtitle != null && (
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {subtitle}
          </MandiText>
        )}
      </Pressable>

      {/* Messaging is offered here because this is where a kitchen is standing
          when a question comes up — about a price, a substitution, a delivery
          that has not arrived. The server refuses it until the two have
          actually traded, and says so. */}
      <Pressable
        onPress={onMessage}
        accessibilityRole="button"
        accessibilityLabel={`Message ${title}`}
        style={({ pressed }) => [styles.message, pressed && styles.pressed]}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} />
      </Pressable>

      <MandiBottomSheet
        visible={switching && header != null}
        onClose={() => setSwitching(false)}
        title={`${header?.supplierName ?? 'Supplier'} branches`}
        closeLabel="Close"
      >
        <MandiText variant="caption" color={Colors.textSecondary}>
          Each branch has its own shelf and its own prices. Nearest first.
        </MandiText>

        <View style={styles.branchList}>
          <BranchRow
            name={storeName}
            city={header?.city ?? null}
            distanceKm={header?.distanceKm ?? null}
            openNow={header?.openNow ?? true}
            current
          />
          {(header?.otherStores ?? []).map((store) => (
            <BranchRow
              key={store.supplierStoreId}
              name={store.storeName}
              city={store.city}
              distanceKm={store.distanceKm}
              openNow={store.openNow}
              onPress={() => {
                setSwitching(false);
                onSwitchStore(store);
              }}
            />
          ))}
        </View>
      </MandiBottomSheet>
    </View>
  );
}

/**
 * The title and caption for a store: the name once. "Sri Balaji Traders — Domlur" under the supplier "Sri Balaji
 * Traders" is the supplier as the title and the locality as the caption; a store with a name of its own keeps it
 * as the title with the supplier beneath; a store named exactly like its supplier has no caption.
 */
export function splitStoreName(storeName: string, supplier: string | null): { title: string; subtitle: string | null } {
  const name = storeName.trim();
  const owner = supplier?.trim() ?? '';
  if (owner === '') return { title: storeName, subtitle: null };
  if (name.toLowerCase() === owner.toLowerCase()) return { title: storeName, subtitle: null };
  if (name.toLowerCase().startsWith(owner.toLowerCase())) {
    const rest = name.slice(owner.length);
    const place = /^\s*[—–-]\s*(\S.*)$/.exec(rest);
    if (place != null) return { title: owner, subtitle: place[1] ?? null };
  }
  return { title: storeName, subtitle: supplier };
}

/**
 * Everything about this supplier that is not their name.
 *
 * <p>Scrolls away, which is the point of separating it from the title. Distance,
 * wait, rating and the credit line are read once on arrival and are in the way
 * for the rest of the visit; the name and the aisles are what a kitchen needs
 * while it shops, and those are the two things that stay.
 */
export function SupplierStoreFacts({
  header,
  onRequestCredit,
  onOpenCredit,
}: {
  header: StorefrontHeader | null;
  onRequestCredit: () => void;
  onOpenCredit: (agreementId: number) => void;
}) {
  if (header == null) {
    return <View />;
  }

  return (
    <View style={styles.card}>
      <View style={styles.facts}>
        {header.distanceKm != null && (
          <Fact
            icon="navigate-outline"
            text={[`${formatQuantity(header.distanceKm)} km`, header.city].filter(Boolean).join(' · ')}
          />
        )}
        {/* Absent rather than guessed: an ETA invented without coordinates is
            a number somebody plans a service around. */}
        {header.etaMinutes != null && (
          <Fact icon="time-outline" text={`Delivery in ~${header.etaMinutes} min`} />
        )}
        {!header.openNow && (
          <Fact
            icon="moon-outline"
            text={header.opensAt != null ? `Opens ${header.opensAt}` : 'Closed'}
          />
        )}
      </View>

      {/* D-094: no request needed here. Stated plainly, because it changes
          what the kitchen is about to do — fill a cart and order, rather than
          fill a cart and wait for an answer. */}
      {header.directOrdersEnabled && (
        <View style={styles.direct}>
          <Ionicons name="flash" size={IconSize.sm} color={Colors.success} />
          <MandiText variant="caption" color={Colors.success} style={styles.flex}>
            Keeps stock — you can order without sending a request first.
          </MandiText>
        </View>
      )}

      <CreditPanel
        header={header}
        onRequestCredit={onRequestCredit}
        onOpenCredit={onOpenCredit}
      />
    </View>
  );
}

/**
 * The credit line, or the offer to ask for one.
 *
 * <p>Three states, and they are genuinely different decisions: spend it, wait
 * for them, or ask. Nothing is inferred from the status — `canFund` is the
 * server saying an order can draw on this now.
 */
function CreditPanel({
  header,
  onRequestCredit,
  onOpenCredit,
}: {
  header: StorefrontHeader;
  onRequestCredit: () => void;
  onOpenCredit: (agreementId: number) => void;
}) {
  const credit = header.credit;

  if (credit == null || credit.status === 'REJECTED' || credit.status === 'CLOSED') {
    return (
      <View style={styles.creditIdle}>
        <View style={styles.flex}>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {credit == null
              ? 'This supplier has not given you credit.'
              : 'You have no credit with this supplier.'}
          </MandiText>
        </View>
        <MandiButton label="Request credit" variant="secondary" size="sm" onPress={onRequestCredit} />
      </View>
    );
  }

  if (!credit.canFund) {
    const waiting = credit.status === 'REQUESTED';
    return (
      <Pressable
        onPress={() => onOpenCredit(credit.agreementId)}
        accessibilityRole="button"
        accessibilityLabel="Open this credit agreement"
        style={({ pressed }) => [styles.creditPending, pressed && styles.pressed]}
      >
        <Ionicons
          name={waiting ? 'time-outline' : 'alert-circle'}
          size={IconSize.sm}
          color={Colors.warning}
        />
        <MandiText variant="caption" color={Colors.warning} style={styles.flex}>
          {waiting
            ? 'Credit requested. Waiting on this supplier.'
            : credit.status === 'APPROVED'
              ? 'Approved on their terms — accept them to start using it.'
              : `Credit ${credit.status.toLowerCase()}. Tap to see why.`}
        </MandiText>
        <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.warning} />
      </Pressable>
    );
  }

  // The bar is a width, not a figure: both numbers beside it are the server's.
  const limit = Number(credit.approvedLimit);
  const used = Number(credit.utilized) + Number(credit.reserved);
  const fraction = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;

  return (
    <Pressable
      onPress={() => onOpenCredit(credit.agreementId)}
      accessibilityRole="button"
      accessibilityLabel={
        `Credit with this supplier. ${formatMoney(credit.available)} available of `
        + `${formatMoney(credit.approvedLimit)}`
      }
      style={({ pressed }) => [styles.creditActive, pressed && styles.pressed]}
    >
      <View style={styles.creditHead}>
        <Ionicons name="card" size={IconSize.sm} color={Colors.credit} />
        <MandiText variant="caption" color={Colors.credit} style={styles.flex}>
          Credit with this supplier
        </MandiText>
        {credit.creditPeriodDays != null && (
          <MandiText variant="caption" color={Colors.credit}>
            {credit.creditPeriodDays} days
          </MandiText>
        )}
        <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.credit} />
      </View>

      {/* The bar repeats what the numbers say rather than replacing them:
          §23A.48 — a length is not readable to everyone, and "₹1,250 of
          ₹60,000" is the fact. */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>

      <View style={styles.creditFigures}>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {formatMoney(credit.utilized)} of {formatMoney(credit.approvedLimit)} used
        </MandiText>
        <MandiText variant="caption" color={Colors.credit}>
          {formatMoney(credit.available)} available
        </MandiText>
      </View>
    </Pressable>
  );
}

function BranchRow({ name, city, distanceKm, openNow, current, onPress }: {
  name: string;
  city: string | null;
  distanceKm: string | null;
  openNow: boolean;
  current?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.flex}>
        <MandiText variant="body" numberOfLines={1}>{name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {[
            city,
            distanceKm != null ? `${formatQuantity(distanceKm)} km` : null,
            openNow ? null : 'Closed',
          ].filter(Boolean).join(' · ')}
        </MandiText>
      </View>
      {current
        ? <MandiText variant="caption" color={Colors.textTertiary}>Viewing</MandiText>
        : <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.textTertiary} />}
    </>
  );

  if (current || onPress == null) {
    return <View style={[styles.branch, styles.branchCurrent]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Shop ${name}`}
      style={({ pressed }) => [styles.branch, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function Fact({ icon, text, tint }: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tint?: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={IconSize.xs} color={tint ?? Colors.textTertiary} />
      <MandiText variant="caption" color={Colors.textSecondary}>{text}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    backgroundColor: Colors.background,
  },
  back: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.md,
  },
  titleBlock: { flex: 1, gap: 1, justifyContent: 'center', minHeight: TouchTarget.min },
  message: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.successGradientStart,
  },
  card: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
  pressed: { opacity: 0.7 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.sm, columnGap: Spacing.lg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  direct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.successLight,
  },
  creditIdle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
  },
  creditPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningLight,
  },
  creditActive: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.creditLight,
  },
  creditHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  track: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: Radius.full, backgroundColor: Colors.credit },
  creditFigures: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  branchList: { gap: Spacing.xs, marginTop: Spacing.sm },
  branch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  branchCurrent: { backgroundColor: Colors.surfaceSunken },
});
