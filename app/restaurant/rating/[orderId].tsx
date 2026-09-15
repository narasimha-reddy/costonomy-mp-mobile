import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import { createRating, fetchRating } from '@/services/trust';
import { StarRating } from '@/components/trust/StarRating';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError, isApiError } from '@/lib/api/errors';
import { track } from '@/analytics';
import { Colors } from '@/theme';

const SCREEN = 'REST-RATING-01';

/**
 * REST-RATING-01. Doc 05 §18.
 *
 * <p>Quality, quantity accuracy, packaging, delivery and overall. Only overall is
 * required — a restaurant that wants to say "fine" and move on should not be held
 * on this screen, and a forced answer on four dimensions produces noise rather
 * than signal.
 *
 * <p><b>Duplicate submission is prevented on both sides.</b> The server allows one
 * rating per order; the screen checks for an existing one first and carries an
 * idempotency key so a double tap cannot become two attempts.
 */
export default function RatingScreen() {
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();

  const [overall, setOverall] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [packaging, setPackaging] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const existing = useQuery({
    queryKey: ['supplier-order', orderId, 'rating'],
    queryFn: () => fetchRating(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
    // 404 means "not rated yet", which is the normal reason to be on this screen.
    retry: (count, error) => !isApiError(error) && count < 2,
  });

  const submit = useMutation({
    mutationFn: () =>
      createRating(accessToken as string, orderId, {
        overall: overall as number,
        productQuality: quality ?? undefined,
        quantityAccuracy: accuracy ?? undefined,
        packaging: packaging ?? undefined,
        delivery: delivery ?? undefined,
        comment: comment || undefined,
      }, idempotencyKey),
    onSuccess: () => {
      track('rating_submitted', { screen: SCREEN, entityId: orderId }, { overall });
      toast.show('Thanks — that helps other kitchens', 'success');
      router.replace('/restaurant/(tabs)/orders');
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error'),
  });

  const alreadyRated = existing.data != null;

  return (
    <MandiScreen
      header={<MandiHeader title="Rate this order" subtitle={order.data?.supplierName} back />}
      footer={
        alreadyRated ? undefined : (
          <MandiStickyBar>
            <MandiButton
              label="Submit rating"
              size="lg"
              disabled={overall == null}
              loading={submit.isPending}
              onPress={() => submit.mutate()}
            />
          </MandiStickyBar>
        )
      }
    >
      {order.isPending || existing.isPending ? (
        <MandiSkeletonList count={2} />
      ) : alreadyRated ? (
        <MandiEmptyState
          icon="checkmark-circle-outline"
          title="You have already rated this order"
          description="One rating per order, so the averages mean something."
          actionLabel="Back to orders"
          onAction={() => router.replace('/restaurant/(tabs)/orders')}
        />
      ) : (
        <>
          <MandiCard>
            <MandiText variant="bodyEmphasis">How was it?</MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              Only the overall rating is required. Ratings affect which suppliers we recommend.
            </MandiText>

            <StarRating label="Overall" value={overall} onChange={setOverall} required />
            <StarRating label="Product quality" value={quality} onChange={setQuality} />
            <StarRating label="Quantity accuracy" value={accuracy} onChange={setAccuracy} />
            <StarRating label="Packaging" value={packaging} onChange={setPackaging} />
            <StarRating label="Delivery" value={delivery} onChange={setDelivery} />
          </MandiCard>

          <MandiFormField
            label="Anything to add? (optional)"
            value={comment}
            onChangeText={setComment}
            placeholder="What went well, what didn't"
            multiline
          />
        </>
      )}
    </MandiScreen>
  );
}
