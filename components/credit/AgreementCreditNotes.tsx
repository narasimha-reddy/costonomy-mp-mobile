import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { MandiButton, MandiErrorState, MandiSkeletonList, MandiText } from '@/components/common';
import { CreditNoteRow, CreditNotesFold } from '@/components/credit/CreditNotesSection';
import { agreementKey } from '@/lib/queryKeys';
import { fetchCreditNotes } from '@/services/credit';
import { Colors, Spacing } from '@/theme';

const PAGE = 20;

/**
 * The credit notes and write-offs on a line, a collapsed section on the supplier's restaurant
 * screen. Nothing is fetched until it is opened. Keyed under the line, so every supplier write
 * refreshes it.
 */
export function AgreementCreditNotes({ agreementId }: { agreementId: number }) {
  const { accessToken } = useSession();
  const [open, setOpen] = useState(false);
  const notes = useInfiniteQuery({
    queryKey: [...agreementKey(agreementId), 'credit-notes'],
    queryFn: ({ pageParam }) => fetchCreditNotes(accessToken as string, agreementId, { page: pageParam, size: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasNext ? all.length : undefined),
    enabled: open && accessToken != null,
  });
  const items = (notes.data?.pages ?? []).flatMap((p) => p.items);

  return (
    <View style={styles.section} testID="agreement-credit-notes">
      <CreditNotesFold title="Credit notes" open={open} onPress={() => setOpen((v) => !v)} />
      {open && (
        notes.isPending ? (
          <MandiSkeletonList count={2} />
        ) : notes.isError ? (
          <MandiErrorState message="Couldn't load the credit notes." onRetry={() => { void notes.refetch(); }} />
        ) : items.length === 0 ? (
          <MandiText variant="caption" color={Colors.textTertiary}>No credit notes yet.</MandiText>
        ) : (
          <>
            {items.map((n) => <CreditNoteRow key={n.id} note={n} />)}
            {notes.hasNextPage && (
              <MandiButton
                testID="credit-notes-more"
                label="Show more credit notes"
                variant="neutral"
                size="md"
                loading={notes.isFetchingNextPage}
                onPress={() => { void notes.fetchNextPage(); }}
              />
            )}
          </>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
});
