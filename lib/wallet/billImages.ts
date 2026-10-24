import { File } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import type { BillFile } from '@/models/wallet';
import { nextShrinkStep, pageFileName, resizePlan, START_QUALITY } from '@/lib/wallet/bill';

/** A page the owner has chosen, with a small picture for the strip (the original is never drawn at full size there). */
export interface BillPage {
  id: string;
  uri: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  size?: number | null;
  /** A ~240 px copy for the page strip; null for a PDF or when it could not be made. */
  thumbUri: string | null;
}

export class BillTooLargeError extends Error {
  constructor() {
    super('A photo is still too large after shrinking. Try taking it again closer, or choose a PDF.');
    this.name = 'BillTooLargeError';
  }
}

/** The file's size in bytes, or null when it cannot be read (web, a content URI). */
export function fileSize(uri: string): number | null {
  try {
    const size = new File(uri).size;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/** A small JPEG for the page strip, so five full-size photos are never decoded at once. */
export async function makeThumb(uri: string, width?: number, height?: number): Promise<string | null> {
  try {
    const landscape = (width ?? 0) >= (height ?? 0);
    const result = await manipulateAsync(
      uri,
      [{ resize: landscape ? { width: 240 } : { height: 240 } }],
      { compress: 0.6, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return null;
  }
}

/**
 * The page as it is sent: a PDF untouched; a picture with its long side at most 2000 px, as a
 * JPEG at quality 0.8, lowered step by step until it is 4.5 MB or less (the server takes 5 MB).
 */
export async function preparePage(page: BillPage, index: number): Promise<BillFile> {
  if (page.type === 'application/pdf') {
    return { uri: page.uri, name: pageFileName(index, page.type, page.name), type: page.type };
  }
  const plan = resizePlan(page.width ?? 0, page.height ?? 0);
  const actions = plan ? [{ resize: plan }] : [];
  let quality = START_QUALITY;
  for (;;) {
    const result = await manipulateAsync(page.uri, actions, { compress: quality, format: SaveFormat.JPEG });
    const step = nextShrinkStep(fileSize(result.uri), quality);
    if (step.action === 'done') {
      return { uri: result.uri, name: pageFileName(index, 'image/jpeg'), type: 'image/jpeg' };
    }
    if (step.action === 'give-up') throw new BillTooLargeError();
    quality = step.quality;
  }
}
