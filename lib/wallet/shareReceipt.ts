import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { saveBlobOnWeb } from '@/lib/wallet/saveFile';
import { DetailLayout } from '@/theme';

/**
 * Turn the receipt picture into a PNG and hand it to the system share sheet.
 *
 * <p>The view is captured at a fixed 1080 px width (360 dp at 3x) so the picture is the
 * same on every phone. On a phone the file is copied into the cache under its real name
 * and opened with expo-sharing; on the web it goes to `navigator.share` as a File when the
 * browser can share files, else it downloads. Throws on failure so the caller can toast.
 */
export async function shareReceiptImage(
  target: unknown,
  fileName: string,
  height?: number | null,
): Promise<void> {
  const width = DetailLayout.receiptPixelWidth;
  const options = {
    format: 'png' as const,
    quality: 1,
    result: Platform.OS === 'web' ? ('data-uri' as const) : ('tmpfile' as const),
    fileName: fileName.replace(/\.png$/, ''),
    width,
    ...(height != null && height > 0
      ? { height: Math.round(height * DetailLayout.receiptScale) }
      : {}),
  };
  const output = await captureRef(target as never, options);

  if (Platform.OS === 'web') {
    await shareOnWeb(output, fileName);
    return;
  }

  let uri = output;
  try {
    // view-shot names its file itself; the copy under the real name is what is shared.
    const named = new File(Paths.cache, fileName);
    if (named.exists) named.delete();
    new File(output).copy(named);
    uri = named.uri;
  } catch {
    // Sharing the capture under its own name is better than not sharing.
    uri = output;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Share receipt',
    UTI: 'public.png',
  });
}

async function shareOnWeb(dataUri: string, fileName: string): Promise<void> {
  const blob = await (await fetch(dataUri)).blob();
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const file = new window.File([blob], fileName, { type: 'image/png' });
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Share receipt' });
      return;
    } catch (e) {
      // Closing the sheet is not a failure.
      if ((e as { name?: string }).name === 'AbortError') return;
      throw e;
    }
  }
  saveBlobOnWeb(blob, fileName);
}
