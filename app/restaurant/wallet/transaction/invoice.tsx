import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MandiButton, MandiConfirm, MandiEmptyState, MandiErrorState, MandiSkeleton, useToast,
} from '@/components/common';
import { BillReading, CheckBanner } from '@/components/wallet/bill/BillReading';
import { ReviewedReading } from '@/components/wallet/bill/ReviewedReading';
import { ReadingDots } from '@/components/wallet/bill/ReadingDots';
import { ZoomableImage } from '@/components/wallet/bill/ZoomableImage';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { DetailHeader } from '@/components/wallet/detail/DetailHeader';
import { useDeleteWalletInvoice, useWalletInvoice } from '@/hooks/useWalletInvoice';
import { billErrorMessage, linkExpired, readingStateCopy } from '@/lib/wallet/bill';
import type { InvoicePage } from '@/models/wallet';
import { BillColors, BillLayout, BillType, DetailColors, WalletColors } from '@/theme';

/**
 * The bill, full screen: the pages (pinch, drag, double-tap; swipe between pages), what was read,
 * the items and totals, and the server's check against the amount paid.
 *
 * <p>Adding, replacing, reviewing and removing a bill need QUICKSCAN_PAY and are hidden without it; looking at the bill does not.
 *
 * <p>Page links last about five minutes. A link that has expired, or an image that fails to load,
 * makes the screen fetch the bill again once and retry with the fresh links.
 */
export default function InvoiceViewerScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const query = useWalletInvoice(id);
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const mayChangeBill = canForOutlet('QUICKSCAN_PAY', outlet);
  const remove = useDeleteWalletInvoice(id);
  const invoice = query.data;

  const [confirm, setConfirm] = useState<'remove' | 'replace' | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const refetched = useRef(false);

  const back = useCallback(() => {
    if (router.canGoBack?.() === false) router.replace('/restaurant/wallet/history');
    else router.back();
  }, [router]);

  /** An image did not load or its link is old: fetch the bill again once, then give up quietly. */
  const linkProblem = useCallback(() => {
    if (!refetched.current) {
      refetched.current = true;
      void query.refetch();
    } else {
      setFailed(true);
    }
  }, [query]);

  const retryImages = useCallback(() => {
    refetched.current = true;
    setFailed(false);
    void query.refetch();
  }, [query]);

  const openPdf = useCallback(async (page: InvoicePage) => {
    let url = page.url;
    try {
      if (linkExpired(page.expiresAt, Date.now())) {
        const fresh = (await query.refetch()).data?.pages.find((p) => p.page === page.page);
        if (fresh) url = fresh.url;
      }
      await Linking.openURL(url);
    } catch {
      toast.show('Could not open the PDF', 'error');
    }
  }, [query, toast]);

  const confirmed = useCallback(async () => {
    const mode = confirm;
    setConfirm(null);
    try {
      await remove.mutateAsync();
      if (mode === 'replace') {
        router.replace({ pathname: '/restaurant/wallet/transaction/bill', params: { id } });
      } else {
        toast.show('Bill removed', 'success');
        back();
      }
    } catch (e) {
      toast.show(billErrorMessage(e), 'error');
    }
  }, [confirm, remove, router, id, toast, back]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPageIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  };

  const trash = invoice != null && mayChangeBill ? (
    <Pressable
      onPress={() => setConfirm('remove')}
      accessibilityRole="button"
      accessibilityLabel="Delete bill"
      hitSlop={8}
      style={styles.trash}
      testID="delete-bill"
    >
      <Ionicons name="trash-outline" size={20} color={WalletColors.white} />
    </Pressable>
  ) : null;

  const header = <DetailHeader color={WalletColors.orange} title="Invoice" onBack={back} right={trash} />;

  if (invoice == null) {
    const notFound = (query.error as { status?: number } | null)?.status === 404;
    return (
      <View style={[styles.page, { paddingBottom: insets.bottom }]}>
        {header}
        {query.isError ? (
          notFound ? (
            <MandiEmptyState
              icon="document-text-outline"
              title="No bill on this payment"
              description="Add the shop's bill from the transaction page."
              {...(mayChangeBill ? {
                actionLabel: 'Add bill',
                onAction: () => router.replace({ pathname: '/restaurant/wallet/transaction/bill', params: { id } }),
              } : {})}
            />
          ) : (
            <MandiErrorState
              message={billErrorMessage(query.error)}
              onRetry={() => { void query.refetch(); }}
              retrying={query.isFetching}
            />
          )
        ) : (
          <View style={styles.loading} testID="invoice-loading">
            <MandiSkeleton height={BillLayout.viewerImageHeight} />
            <MandiSkeleton height={120} />
          </View>
        )}
      </View>
    );
  }

  const reading = invoice.reading;
  const stateText = readingStateCopy(invoice.status, invoice.error, query.gaveUp);
  const pages = invoice.pages;

  return (
    <View style={styles.page}>
      {header}
      <FlatList
        data={[0]}
        keyExtractor={() => 'body'}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={() => (
          <View>
            <View style={styles.viewer} testID="bill-viewer">
              {failed ? (
                <View style={[styles.failed, { width }]}>
                  <Text style={styles.failedText}>We could not load the bill photo.</Text>
                  <MandiButton label="Try again" onPress={retryImages} variant="secondary" fullWidth={false} />
                </View>
              ) : (
                <FlatList
                  data={pages}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(p) => String(p.page)}
                  onMomentumScrollEnd={onScrollEnd}
                  initialNumToRender={1}
                  windowSize={3}
                  getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                  renderItem={({ item }) => (
                    <PageView
                      page={item}
                      width={width}
                      onProblem={linkProblem}
                      onOpenPdf={openPdf}
                      label={`Bill page ${item.page} of ${pages.length}`}
                    />
                  )}
                />
              )}
              {pages.length > 1 && (
                <View style={styles.dots} accessibilityLabel={`Page ${pageIndex + 1} of ${pages.length}`}>
                  {pages.map((p, i) => (
                    <View key={p.page} style={[styles.dot, i === pageIndex && styles.dotOn]} />
                  ))}
                </View>
              )}
            </View>

            <View style={styles.body}>
              {stateText != null && (
                <View style={styles.state} testID={`state-${invoice.status.toLowerCase()}`}>
                  {invoice.status === 'READING' ? (
                    <>
                      <MandiSkeleton height={14} width="60%" />
                      <MandiSkeleton height={14} width="85%" />
                      <View style={styles.stateRow}>
                        <Text style={styles.stateText}>{stateText}</Text>
                        {!query.gaveUp && <ReadingDots />}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.stateText} accessibilityRole="alert">{stateText}</Text>
                      {mayChangeBill && (
                        <MandiButton
                          label="Replace bill"
                          onPress={() => setConfirm('replace')}
                          variant="secondary"
                          fullWidth={false}
                        />
                      )}
                    </>
                  )}
                </View>
              )}
              {invoice.status === 'READ' && <CheckBanner check={invoice.check} />}
              {mayChangeBill && (invoice.status === 'READ' || invoice.status === 'UNREADABLE') && (
                <MandiButton
                  label="Review and edit"
                  icon="create-outline"
                  onPress={() => router.push({ pathname: '/restaurant/wallet/transaction/bill-review', params: { id } })}
                  accessibilityHint="Check what was read, fix anything wrong, then save"
                  testID="review-and-edit"
                />
              )}
              {invoice.review != null && <ReviewedReading review={invoice.review} />}
              {invoice.review != null && invoice.status === 'READ' && reading != null && (
                <Pressable
                  onPress={() => setShowRead((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showRead }}
                  style={styles.readToggle}
                  testID="toggle-reading"
                >
                  <Text style={styles.readToggleText}>{showRead ? 'Hide what was read' : 'Show what was read'}</Text>
                  <Ionicons name={showRead ? 'chevron-up' : 'chevron-down'} size={16} color={DetailColors.secondary} />
                </Pressable>
              )}
              {invoice.status === 'READ' && reading != null && (invoice.review == null || showRead) && <BillReading reading={reading} />}
            </View>
          </View>
        )}
      />

      <MandiConfirm
        visible={confirm != null}
        title={confirm === 'replace' ? 'Replace this bill?' : 'Remove this bill?'}
        message={confirm === 'replace'
          ? 'The current photo is removed and you can add a new one.'
          : 'The photo and what was read from it are deleted. You can add the bill again later.'}
        confirmLabel={confirm === 'replace' ? 'Replace bill' : 'Remove bill'}
        cancelLabel="Keep bill"
        destructive
        onConfirm={() => { void confirmed(); }}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

function PageView({
  page, width, onProblem, onOpenPdf, label,
}: {
  page: InvoicePage;
  width: number;
  onProblem: () => void;
  onOpenPdf: (page: InvoicePage) => void;
  label: string;
}) {
  const isPdf = page.contentType === 'application/pdf';
  // An expired link is replaced before it is tried (the screen allows this once).
  useEffect(() => {
    if (!isPdf && linkExpired(page.expiresAt, Date.now())) onProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.url]);
  return (
    <View style={{ width, height: BillLayout.viewerImageHeight, justifyContent: 'center' }}>
      {isPdf ? (
        <Pressable
          onPress={() => onOpenPdf(page)}
          accessibilityRole="button"
          accessibilityLabel={`PDF page ${page.page}, open`}
          style={styles.pdf}
          testID="pdf-tile"
        >
          <Ionicons name="document-text-outline" size={36} color={BillColors.viewerChrome} />
          <Text style={styles.pdfText}>PDF · open</Text>
        </Pressable>
      ) : (
        <ZoomableImage uri={page.url} width={width} height={BillLayout.viewerImageHeight} label={label} onError={onProblem} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: DetailColors.page },
  loading: { padding: 16, gap: 12 },
  trash: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  viewer: { backgroundColor: BillColors.viewerBg, height: BillLayout.viewerImageHeight },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: BillColors.viewerDot },
  dotOn: { backgroundColor: BillColors.viewerChrome },
  pdf: { alignSelf: 'center', alignItems: 'center', gap: 8, padding: 24, minHeight: 44 },
  pdfText: { ...BillType.bodyStrong, color: BillColors.viewerChrome },
  failed: { height: BillLayout.viewerImageHeight, alignItems: 'center', justifyContent: 'center', gap: 12 },
  failedText: { ...BillType.body, color: BillColors.viewerChrome },
  body: { padding: 12, gap: 12 },
  state: { backgroundColor: DetailColors.card, borderRadius: 8, padding: 14, gap: 10 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stateText: { ...BillType.body, color: DetailColors.secondary },
  readToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  readToggleText: { ...BillType.bodyStrong, color: DetailColors.secondary },
});
