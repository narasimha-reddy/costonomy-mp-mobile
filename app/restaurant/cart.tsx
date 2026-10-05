import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRequestBasket, useInvalidateBasket } from '@/hooks/useRequestBasket';
import { useDebouncedEdits } from '@/hooks/useDebouncedEdits';
import { DeliveryDayChoice } from '@/components/restaurant/DeliveryDayChoice';
import { preferredDateFor } from '@/lib/delivery/deliveryDay';
import {
  addIntentItem,
  prepareDirectOrder,
  removeIntentItem,
  sendBasket,
  updateIntentItem,
} from '@/services/intent';
import {
  SupplierSectionBody,
  SupplierSectionHeader,
  sectionWarning,
} from '@/components/restaurant/CartSupplierSection';
import {
  MandiBottomSheet,
  MandiButton,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiHeaderAction,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import type { HeldRequest, Intent } from '@/models/intent';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-CART-01';

/**
 * The basket — one request per supplier, sent in one action. D-088, D-090.
 *
 * <p><b>The prices here are real.</b> They are the supplier's current price, and
 * sending locks them: the supplier's reply confirms that figure or declines the
 * line, and the order is created on the same number. So nothing here is hedged
 * with a tilde — a figure somebody is about to commit to should not be labelled
 * "approximately".
 *
 * <p>What makes that honest is the check before sending. If a supplier has
 * repriced since an item was added, that request is <b>held</b> and the change
 * shown, old and new, to be accepted — §23A.16, and the reason the number can be
 * trusted the rest of the time.
 *
 * <p><b>It is a basket, so it persists.</b> Leaving without sending changes
 * nothing: the drafts live on the server, and reopening reloads them at whatever
 * the prices are then.
 */
export default function BasketScreen() {
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { basket, drafts, loading, error, refetch } = useRequestBasket();
  const invalidate = useInvalidateBasket();

  /**
   * Requests held back over a price change, and which send produced them.
   *
   * <p>`intentId` is carried so accepting sends back exactly what was asked
   * for: agreeing to one supplier's new price is not agreement to send the
   * other two.
   */
  const [held, setHeld] = useState<{
    requests: HeldRequest[];
    intentId?: number;
    /** Agreeing continues to an order rather than sending a request. */
    direct?: boolean;
  } | null>(null);
  const [explaining, setExplaining] = useState(false);
  /** Days from today the buyer wants delivery, or null for immediate. Sent with every request. */
  const [dayOffset, setDayOffset] = useState<number | null>(null);

  /**
   * Quantity taps are held briefly and sent as one decision, so a burst of taps
   * is one write, edits to a line land in order, and nothing is dropped when the
   * screen is left. Sending and ordering wait for them (see `flush` below).
   */
  const edits = useDebouncedEdits(async (itemId, quantity) => {
    try {
      await updateIntentItem(accessToken as string, itemId, String(quantity));
    } catch (caught) {
      toast.show(caught instanceof ApiError ? caught.message : 'Could not update that.', 'error');
    }
    await invalidate();
  });
  const { flush } = edits;

  const remove = useMutation({
    mutationFn: ({ itemId }: { itemId: number; supplierSkuId: number; quantity: string }) =>
      removeIntentItem(accessToken as string, itemId),
    onSuccess: (_result, removed) => {
      void invalidate();
      // The line is gone for good (the server keeps no row), so putting it back
      // is a fresh add of the same pack and quantity.
      toast.show('Removed from your request', 'info', {
        label: 'Undo',
        onPress: () => {
          addIntentItem(accessToken as string, outletId as number, {
            supplierSkuId: removed.supplierSkuId,
            quantity: removed.quantity,
          })
            .then(() => invalidate())
            .catch((caught) =>
              toast.show(
                caught instanceof ApiError ? caught.message : 'Could not put that back.',
                'error',
              ));
        },
      });
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not remove that.', 'error'),
  });

  /** Minus at one removes the line, with an undo, rather than writing a zero. */
  const removeLine = (itemId: number) => {
    const item = drafts.flatMap((draft) => draft.items).find((line) => line.id === itemId);
    if (item == null) return;
    edits.discard(itemId);
    remove.mutate({
      itemId,
      supplierSkuId: item.supplierSkuId,
      quantity: String(item.requestedQuantity),
    });
  };

  const changeQuantity = (itemId: number, quantity: string) => {
    const packs = Number(quantity);
    if (packs <= 0) {
      removeLine(itemId);
      return;
    }
    edits.set(itemId, packs);
  };

  /**
   * Order from one supplier without asking them first. D-094.
   *
   * <p>Two steps rather than one: the server makes the draft orderable — at the
   * live price, with stock checked — and the restaurant lands on the same review
   * screen a supplier's answer would have produced, where they choose how the
   * goods travel and pay. The order is created there, by the same code, because
   * a second path to creating an order is a second place for the money to be
   * wrong.
   *
   * <p>A price that moved comes back as `held` and is shown in the sheet the
   * basket already uses. Nothing is prepared until it is agreed to.
   */
  const orderDirectly = useMutation({
    mutationFn: async ({ intentId, acceptPriceChanges }: {
      intentId: number;
      acceptPriceChanges: boolean;
    }) => {
      await flush();
      return prepareDirectOrder(accessToken as string, intentId, acceptPriceChanges);
    },
    onSuccess: (result, variables) => {
      void invalidate();
      if (result.held.length > 0) {
        setHeld({ requests: result.held, intentId: variables.intentId, direct: true });
        return;
      }
      setHeld(null);
      if (result.intent != null) {
        track('direct_order_prepared', { screen: SCREEN, entityId: result.intent.id });
        router.replace(`/restaurant/requests/${result.intent.id}`);
      }
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not start that order.',
        'error',
      ),
  });

  const send = useMutation({
    mutationFn: async ({ acceptPriceChanges, intentId }: {
      acceptPriceChanges: boolean;
      intentId?: number;
    }) => {
      // What was tapped is what gets sent: a quantity still waiting its turn is
      // written first, or the request would go out with the old one.
      await flush();
      return sendBasket(accessToken as string, outletId as number, {
        acceptPriceChanges,
        intentId,
        preferredDeliveryDate: preferredDateFor(dayOffset),
      });
    },
    onSuccess: (result, variables) => {
      track('basket_sent', { screen: SCREEN, outletId }, { sent: result.sent.length });
      void invalidate();

      if (result.held.length > 0) {
        // Shown rather than sent. The unaffected requests have already gone,
        // which is why this is a sheet over a still-useful screen rather than an
        // error that loses the whole action.
        setHeld({ requests: result.held, intentId: variables.intentId });
        return;
      }

      setHeld(null);

      // One supplier sent out of several: the cart is still the screen they are
      // working on, so it stays put and says what went. Navigating away here
      // would take the other requests off screen mid-decision.
      if (variables.intentId != null && drafts.length > result.sent.length) {
        const [only] = result.sent;
        toast.show(
          only?.storeName != null ? `Request sent to ${only.storeName}` : 'Request sent',
          'success',
        );
        return;
      }
      const only = result.sent.length === 1 ? result.sent[0] : undefined;
      if (only != null) {
        // Straight to the one request, since there is nothing to choose between.
        router.replace(`/restaurant/requests/${only.id}`);
      } else {
        toast.show(`${result.sent.length} requests sent`, 'success');
        router.replace('/restaurant/(tabs)/requests');
      }
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error'),
  });

  const empty = drafts.length === 0;

  /**
   * Which suppliers are open.
   *
   * <p>Holds the ones the person has *changed*, not the ones that are open:
   * the default depends on how many requests there are, and storing the
   * resolved state would freeze whichever default applied when the screen
   * first rendered — adding a third supplier would leave the first two open
   * because they were open under the two-supplier rule.
   */
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const [collapseAll, setCollapseAll] = useState<boolean | null>(null);

  /**
   * Open by default up to two requests, closed beyond that.
   *
   * <p>Two fit on a screen; three or more is the scroll this grouping exists to
   * fix, and a list of headings is the only view of it that shows the shape.
   * A request with something to say about its prices ignores all of this and
   * stays open — see `sectionWarning`.
   */
  const defaultExpanded = collapseAll ?? drafts.length <= 2;
  const isExpanded = (draft: Intent) =>
    sectionWarning(draft) != null || (toggled[draft.id] ?? defaultExpanded);

  // Over the sections that can actually close. Counting the locked-open ones
  // would leave "Collapse all" on a list it cannot collapse.
  const collapsible = drafts.filter((draft) => sectionWarning(draft) == null);
  const allOpen = collapsible.length > 0 && collapsible.every((draft) => isExpanded(draft));

  const nodes: React.ReactNode[] = [];
  const sticky: number[] = [];

  if (loading) {
    nodes.push(<MandiSkeletonList key="loading" count={3} />);
  } else if (error) {
    nodes.push(
      <MandiErrorState
        key="error"
        message="Couldn't load your requests."
        onRetry={() => refetch()}
      />,
    );
  } else if (empty) {
    nodes.push(
      <MandiEmptyState
        key="empty"
        icon="cart-outline"
        title="Nothing here yet"
        description="Find what you need and add it. You'll send a request to each supplier, and only pay once they confirm what they can supply."
        actionLabel="Start searching"
        onAction={() => router.push('/restaurant/search')}
      />,
    );
  } else {
    if (drafts.length > 1) {
      nodes.push(
        <MandiSectionHeader
          key="heading"
          title="Requests"
          count={drafts.length}
          subtitle="One per supplier, sent together"
          // `inlineAction`: this acts on the list below rather than opening
          // another screen, so it must not wear a "see all" chevron.
          inlineAction
          actionLabel={
            collapsible.length === 0 ? undefined : allOpen ? 'Collapse all' : 'Expand all'
          }
          onAction={() => {
            setToggled({});
            setCollapseAll(!allOpen);
          }}
          style={styles.heading}
        />,
      );
    }

    nodes.push(
      <DeliveryDayChoice key="delivery-day" value={dayOffset} onChange={setDayOffset} />,
    );

    drafts.forEach((draft, index) => {
      const warning = sectionWarning(draft);
      const expanded = isExpanded(draft);
      // The index is into the scroll view's children, which is why the header
      // and the body are pushed flat rather than wrapped together.
      sticky.push(nodes.length);
      nodes.push(
        <SupplierSectionHeader
          key={`head-${draft.id}`}
          draft={draft}
          sequence={index + 1}
          expanded={expanded}
          warning={warning}
          onToggle={() =>
            setToggled((current) => ({ ...current, [draft.id]: !expanded }))}
        />,
      );
      nodes.push(
        <SupplierSectionBody
          key={`body-${draft.id}`}
          draft={draft}
          expanded={expanded}
          sending={send.isPending && send.variables?.intentId === draft.id}
          ordering={orderDirectly.isPending && orderDirectly.variables?.intentId === draft.id}
          shownQuantity={edits.valueFor}
          onChangeQuantity={changeQuantity}
          onRemove={removeLine}
          onSend={() => send.mutate({ acceptPriceChanges: false, intentId: draft.id })}
          onOrderDirectly={() =>
            orderDirectly.mutate({ intentId: draft.id, acceptPriceChanges: false })}
          onOpenSku={(supplierSkuId) => router.push(`/restaurant/sku/${supplierSkuId}`)}
        />,
      );
    });
  }

  nodes.push(
    <PriceChangeSheet
      key="held"
      held={held?.requests ?? null}
      accepting={send.isPending || orderDirectly.isPending}
      direct={held?.direct ?? false}
      onAccept={() => {
        // Whichever action produced the hold is the one that continues. Agreeing
        // to a new price is agreement to that price, not to a different action.
        if (held?.direct && held.intentId != null) {
          orderDirectly.mutate({ intentId: held.intentId, acceptPriceChanges: true });
        } else {
          send.mutate({ acceptPriceChanges: true, intentId: held?.intentId });
        }
      }}
      onDismiss={() => setHeld(null)}
    />,
    <HowItWorksSheet
      key="explainer"
      visible={explaining}
      onClose={() => setExplaining(false)}
    />,
  );

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Cart"
          back
          right={
            <MandiHeaderAction
              icon="information-circle-outline"
              label="How requests and payment work"
              onPress={() => setExplaining(true)}
            />
          }
        />
      }
      onRefresh={() => refetch()}
      stickyIndices={sticky.length > 0 ? sticky : undefined}
      // The sections carry their own spacing, because a heading and the lines
      // under it are one surface and a container gap would split them.
      contentStyle={styles.list}
      footer={
        empty || basket == null ? undefined : (
          <MandiStickyBar>
            <View style={styles.totalRow}>
              <View style={styles.flex}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {basket.itemCount} item{basket.itemCount === 1 ? '' : 's'} ·{' '}
                  {basket.supplierCount} supplier{basket.supplierCount === 1 ? '' : 's'}
                </MandiText>
                {!basket.pricedComplete && (
                  <MandiText variant="caption" color={Colors.warning}>
                    Some items have no price
                  </MandiText>
                )}
              </View>
              <MandiText variant="priceLarge">{formatMoney(basket.agreedTotal)}</MandiText>
            </View>
            {/* One button for the lot, which still creates a separate request
                per supplier — each is its own conversation and becomes its own
                order, so the label counts them rather than pretending it is one
                thing. */}
            <MandiButton
              label={
                basket.supplierCount === 1
                  ? 'Send Request'
                  : `Send ${basket.supplierCount} Requests`
              }
              size="lg"
              loading={send.isPending && send.variables?.intentId == null}
              onPress={() => send.mutate({ acceptPriceChanges: false })}
            />
          </MandiStickyBar>
        )
      }
    >
      {nodes}
    </MandiScreen>
  );
}


/**
 * The prices that moved, and the decision about them.
 *
 * <p>Old and new for every line, because §23A.16 asks for the change to be
 * shown rather than described. Requests that were not affected have already gone
 * by the time this appears, and the copy says so — discovering afterwards that
 * two of three went out is worse than either outcome on its own.
 */
function PriceChangeSheet({
  held,
  accepting,
  direct,
  onAccept,
  onDismiss,
}: {
  held: HeldRequest[] | null;
  accepting: boolean;
  /** Agreeing continues to an order rather than sending a request. */
  direct?: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  if (held == null || held.length === 0) {
    return null;
  }

  return (
    <MandiBottomSheet visible title="Prices have changed" onClose={onDismiss}>
      <MandiText variant="caption" color={Colors.textSecondary}>
        {held.length === 1 ? 'This supplier has' : 'These suppliers have'} repriced since
        you added the items, so nothing has been {direct ? 'ordered' : 'sent'} yet.
      </MandiText>

      <ScrollView style={styles.sheetScroll}>
        {held.map((request) => (
          <View key={request.intentId} style={styles.heldBlock}>
            <MandiText variant="bodyEmphasis" numberOfLines={1}>
              {request.storeName ?? request.reference}
            </MandiText>
            {request.changes.map((change) => (
              <View key={change.intentItemId} style={styles.changeRow}>
                <MandiText variant="body" style={styles.flex} numberOfLines={1}>
                  {change.productName ?? 'Item'}
                </MandiText>
                <View style={styles.changeAmounts}>
                  <MandiText variant="caption" color={Colors.textTertiary} struck>
                    {formatMoney(change.previousUnitPrice)}
                  </MandiText>
                  <MandiText variant="bodyEmphasis">
                    {formatMoney(change.currentUnitPrice)}
                  </MandiText>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* The label says what agreeing does, which is not the same on both
          paths: one sends a request, the other starts an order. */}
      <MandiButton
        label={direct ? 'Accept And Continue' : 'Accept And Send'}
        size="lg"
        loading={accepting}
        onPress={onAccept}
      />
      <MandiButton label="Keep In Basket" variant="tertiary" size="md" onPress={onDismiss} />
    </MandiBottomSheet>
  );
}


/**
 * What happens after "Send", and when money moves. §23A.15.
 *
 * <p>Replaces a line of standing text on the screen. That line had to be short
 * enough not to be in the way, which left it saying only that nothing is charged
 * yet — true, and no help at all to somebody wondering why they have been asked
 * for a request rather than an order. The question is not frequent enough to
 * earn permanent space and is too involved to answer in one sentence, so it
 * moves behind the header's info button and gets answered properly.
 *
 * <p>Every claim here is one the server enforces: the supplier really cannot see
 * an unfunded order (guardrail 16), and a price really is locked at send (D-090).
 * If either changes, this copy is wrong and has to change with it.
 */
function HowItWorksSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title="How requests become orders"
      closeLabel="Close"
    >
      <ScrollView style={styles.explainerScroll}>
        <Step
          number={1}
          title="You send a request"
          body="One per supplier, with the quantities you need. Nothing is charged and nothing is reserved. The price on each line is the supplier's current price, and sending locks it — they answer at that figure or decline the line."
        />
        <Step
          number={2}
          title="The supplier replies"
          body="They have a countdown to confirm what they can supply. They may take the whole request, part of it, or none of it. Whatever they cannot supply stays with you to source elsewhere."
        />
        <Step
          number={3}
          title="You create the order"
          body="Once a supplier has accepted, you have a window to order against their answer. This is where you choose how the goods travel — collect them yourself, have the supplier deliver, or have us arrange a courier. A delivery fee is quoted before you commit to it."
        />
        <Step
          number={4}
          title="You pay, and only then does it start"
          body="Payment is taken at order time, from your wallet or against credit a supplier has approved for you. The supplier does not see the order until it is funded, so nobody starts cooking against money that has not arrived."
        />
        <Step
          number={5}
          title="They prepare it, and you receive it"
          body="Preparing, then ready for pickup or out for delivery. The order is complete when you have the goods — you confirm that, not the supplier."
          last
        />
      </ScrollView>
    </MandiBottomSheet>
  );
}

function Step({ number, title, body, last }: {
  number: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.step, last && styles.stepLast]}>
      <View style={styles.stepNumber}>
        <MandiText variant="caption" color={Colors.textInverse}>{number}</MandiText>
      </View>
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{title}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{body}</MandiText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // No gap: a supplier's heading and its lines are one surface, and a gap
  // between every child would part them. The sections space themselves.
  list: { gap: 0 },
  heading: { marginBottom: Spacing.sm },
  explainerScroll: { maxHeight: 420 },
  step: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
    marginTop: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  stepLast: { borderBottomWidth: 0, paddingBottom: 0 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sheetScroll: { maxHeight: 280 },
  heldBlock: { gap: Spacing.xs, marginTop: Spacing.md },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  changeAmounts: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
