import React, { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiButton, MandiEmptyState, useToast } from '@/components/common';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { DetailHeader } from '@/components/wallet/detail/DetailHeader';
import { useUploadWalletInvoice } from '@/hooks/useWalletInvoice';
import {
  MAX_BILL_PAGES, billErrorMessage, billErrorRetryable, fileProblem, fitPages, pageRoom,
} from '@/lib/wallet/bill';
import { BillTooLargeError, makeThumb, preparePage, type BillPage } from '@/lib/wallet/billImages';
import type { BillFile } from '@/models/wallet';
import { BillColors, BillLayout, BillType, DetailColors, WalletColors } from '@/theme';

let nextId = 1;
const newId = () => `page-${nextId++}`;

type Phase = 'idle' | 'preparing' | 'uploading';

/**
 * Add bill: take or choose the shop's bill (up to five pages, photos or a PDF), shrink the photos,
 * upload, and go back to the details page where the Invoice row shows "Reading the bill...".
 *
 * <p>Needs QUICKSCAN_PAY: without it (a deep link) a plain "no permission" state is shown instead of the form.
 *
 * <p>The pages stay chosen after any failure, so "Try again" never means starting over.
 */
export default function AddBillScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const upload = useUploadWalletInvoice(id);
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const mayChangeBill = canForOutlet('QUICKSCAN_PAY', outlet);

  const [pages, setPages] = useState<BillPage[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const prepared = useRef(new Map<string, BillFile>());

  const busy = phase !== 'idle';
  const room = pageRoom(pages.length);

  const back = useCallback(() => {
    if (router.canGoBack?.() === false) router.replace('/restaurant/wallet/history');
    else router.back();
  }, [router]);

  const addPages = useCallback(async (picked: Omit<BillPage, 'id' | 'thumbUri'>[]) => {
    const { accepted, dropped } = fitPages(pages.length, picked);
    const withThumbs: BillPage[] = [];
    for (const p of accepted) {
      withThumbs.push({
        ...p,
        id: newId(),
        thumbUri: p.type === 'application/pdf' ? null : await makeThumb(p.uri, p.width, p.height),
      });
    }
    setPages((current) => [...current, ...withThumbs].slice(0, MAX_BILL_PAGES));
    setError(null);
    setNotice(dropped > 0 ? `A bill can have ${MAX_BILL_PAGES} pages. ${dropped} extra ${dropped === 1 ? 'file was' : 'files were'} left out.` : null);
  }, [pages.length]);

  const takePhoto = useCallback(async () => {
    if (busy || room === 0) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setNotice('Allow camera access in Settings to take a photo, or choose one from your gallery.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      await addPages(result.assets.map((a) => ({
        uri: a.uri, name: a.fileName ?? '', type: a.mimeType ?? 'image/jpeg',
        width: a.width, height: a.height, size: a.fileSize ?? null,
      })));
    } catch {
      setNotice('The camera is not available here. Choose a photo from your gallery instead.');
    }
  }, [busy, room, addPages]);

  const chooseFromGallery = useCallback(async () => {
    if (busy || room === 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: room,
        quality: 0.8,
      });
      if (result.canceled) return;
      await addPages(result.assets.map((a) => ({
        uri: a.uri, name: a.fileName ?? '', type: a.mimeType ?? 'image/jpeg',
        width: a.width, height: a.height, size: a.fileSize ?? null,
      })));
    } catch {
      setNotice('We could not open your gallery. Please try again.');
    }
  }, [busy, room, addPages]);

  const addPdf = useCallback(async () => {
    if (busy || room === 0) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const ok: Omit<BillPage, 'id' | 'thumbUri'>[] = [];
      let problem: string | null = null;
      for (const a of result.assets) {
        const type = (a.mimeType ?? '').toLowerCase();
        // A picture picked here is re-encoded as JPEG before upload, so any image type will do.
        const issue = type.startsWith('image/') ? null : fileProblem({ type, size: a.size });
        if (issue) problem = issue;
        else ok.push({ uri: a.uri, name: a.name, type, size: a.size ?? null });
      }
      if (ok.length > 0) await addPages(ok);
      if (problem) setNotice(problem);
    } catch {
      setNotice('We could not open that file. Please try again.');
    }
  }, [busy, room, addPages]);

  const removePage = useCallback((pageId: string) => {
    if (busy) return;
    prepared.current.delete(pageId);
    setPages((current) => current.filter((p) => p.id !== pageId));
    setError(null);
    setNotice(null);
  }, [busy]);

  const submit = useCallback(async () => {
    if (busy || pages.length === 0) return;
    setError(null);
    setNotice(null);
    setProgress(0);
    let files: BillFile[];
    try {
      setPhase('preparing');
      files = [];
      for (const [i, page] of pages.entries()) {
        let file = prepared.current.get(page.id);
        if (file == null) {
          file = await preparePage(page, i);
          prepared.current.set(page.id, file);
        }
        files.push(file);
      }
    } catch (e) {
      setPhase('idle');
      setError({
        message: e instanceof BillTooLargeError ? e.message : 'We could not prepare the photos. Please try again.',
        retry: !(e instanceof BillTooLargeError),
      });
      return;
    }

    try {
      setPhase('uploading');
      await upload.mutateAsync({ files, onProgress: setProgress });
      toast.show('Bill added. Reading it now.', 'success');
      back();
    } catch (e) {
      setPhase('idle');
      setError({ message: billErrorMessage(e), retry: billErrorRetryable(e) });
    }
  }, [busy, pages, upload, toast, back]);

  const headline = pages.length === 0 ? 'Add the shop\'s bill' : 'Add another page';

  if (!mayChangeBill) {
    return (
      <View style={styles.page}>
        <DetailHeader color={WalletColors.orange} title="Add bill" onBack={back} />
        <MandiEmptyState icon="lock-closed-outline" title="You don't have permission to add or change bills" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <DetailHeader color={WalletColors.orange} title="Add bill" onBack={back} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {pages.length === 0 && (
          <Text style={styles.hint}>
            Take a clear photo of the whole bill, flat and in good light. A long bill can have up to
            {` ${MAX_BILL_PAGES}`} pages.
          </Text>
        )}

        {pages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            testID="page-strip"
          >
            {pages.map((p, i) => (
              <View key={p.id} style={styles.tile} testID={`bill-page-${i + 1}`}>
                {p.thumbUri != null ? (
                  <Image source={{ uri: p.thumbUri }} style={styles.tileImage} resizeMode="cover" accessibilityIgnoresInvertColors />
                ) : (
                  <View style={styles.pdfTile}>
                    <Ionicons name="document-text-outline" size={28} color={DetailColors.icon} />
                    <Text style={styles.pdfLabel}>PDF</Text>
                  </View>
                )}
                <Text style={styles.pageNo}>{i + 1}</Text>
                <Pressable
                  onPress={() => removePage(p.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove page ${i + 1}`}
                  hitSlop={8}
                  style={styles.remove}
                >
                  <Ionicons name="close" size={16} color={WalletColors.white} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {room > 0 && (
          <View style={styles.options}>
            <Text style={styles.headline} accessibilityRole="header">{headline}</Text>
            <MandiButton label="Take photo" icon="camera-outline" onPress={takePhoto} disabled={busy} variant="secondary" />
            <MandiButton label="Choose from gallery" icon="images-outline" onPress={chooseFromGallery} disabled={busy} variant="neutral" />
            <MandiButton label="Add PDF" icon="document-outline" onPress={addPdf} disabled={busy} variant="neutral" />
          </View>
        )}
        {room === 0 && <Text style={styles.hint}>That is the most pages one bill can have.</Text>}

        {notice != null && (
          <Text style={styles.notice} accessibilityLiveRegion="polite" testID="bill-notice">{notice}</Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {error != null && (
          <View style={styles.error} testID="bill-error" accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={20} color={BillColors.danger} />
            <Text style={styles.errorText}>{error.message}</Text>
            {error.retry && (
              <MandiButton label="Try again" onPress={() => { void submit(); }} variant="tertiary" size="md" fullWidth={false} />
            )}
          </View>
        )}
        {phase !== 'idle' && (
          <View style={styles.progressBlock} testID="bill-progress">
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: phase === 'uploading' ? Math.round(progress * 100) : 0 }}
            >
              <View style={[styles.fill, { width: `${Math.round((phase === 'uploading' ? progress : 0.05) * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {phase === 'preparing' ? 'Preparing photos…' : `Uploading… ${Math.round(progress * 100)}%`}
            </Text>
          </View>
        )}
        <MandiButton
          label="Upload bill"
          onPress={() => { void submit(); }}
          disabled={pages.length === 0 || busy}
          loading={busy}
          testID="upload-bill"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: DetailColors.page },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  hint: { ...BillType.body, color: DetailColors.secondary },
  headline: { ...BillType.title, color: DetailColors.name },
  options: { gap: 10 },
  notice: { ...BillType.small, color: BillColors.differText },
  strip: { gap: 10, paddingVertical: 4 },
  tile: {
    width: BillLayout.pageThumb,
    height: BillLayout.pageThumb * 1.3,
    borderRadius: BillLayout.thumbRadius,
    backgroundColor: BillColors.thumbBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BillColors.thumbBorder,
    overflow: 'visible',
  },
  tileImage: { width: '100%', height: '100%', borderRadius: BillLayout.thumbRadius },
  pdfTile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pdfLabel: { ...BillType.tableHead, color: DetailColors.secondary },
  pageNo: {
    ...BillType.tableHead,
    position: 'absolute',
    left: 6,
    bottom: 4,
    color: WalletColors.white,
    backgroundColor: BillColors.scrim,
    paddingHorizontal: 5,
    borderRadius: 4,
    overflow: 'hidden',
  },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BillColors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: DetailColors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DetailColors.divider,
  },
  error: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  errorText: { ...BillType.body, flex: 1, color: BillColors.danger },
  progressBlock: { gap: 6 },
  track: { height: BillLayout.progressHeight, borderRadius: 3, backgroundColor: BillColors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: WalletColors.orange },
  progressText: { ...BillType.small, color: DetailColors.secondary },
});
