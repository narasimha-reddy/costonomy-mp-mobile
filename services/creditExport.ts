import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { API_BASE_URL } from '@/lib/api/config';
import { renewAccessToken } from '@/lib/api/session-bridge';
import { saveBlobOnWeb } from '@/lib/wallet/saveFile';

/** A CSV the server made: the file name it chose and the text. */
export interface CsvFile {
  filename: string;
  body: string;
}

export type CsvFailure = 'too_large' | 'offline' | 'unavailable' | 'forbidden' | 'not_found' | 'failed';

export const TOO_LARGE_TEXT = 'Too many rows. Pick a shorter period.';
export const OFFLINE_TEXT = 'You are offline. Connect and try again.';
export const UNAVAILABLE_TEXT = "Sharing isn't available on this device.";
export const FAILED_TEXT = "Couldn't make the file. Please try again.";

const MESSAGES: Record<CsvFailure, string> = {
  too_large: TOO_LARGE_TEXT,
  offline: OFFLINE_TEXT,
  unavailable: UNAVAILABLE_TEXT,
  forbidden: "You don't have permission to export this.",
  not_found: 'This credit line is not available to you.',
  failed: FAILED_TEXT,
};

/** A failed export, with the plain words to show. Never a raw code. */
export class CsvExportError extends Error {
  readonly kind: CsvFailure;

  constructor(kind: CsvFailure) {
    super(MESSAGES[kind]);
    this.name = 'CsvExportError';
    this.kind = kind;
  }
}

/** The file name in a `Content-Disposition` header, safe to use as a file name. Null when absent. */
export function filenameFrom(header: string | null | undefined): string | null {
  if (header == null) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'[^']*')?([^;]+)/i.exec(header);
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  let raw = star?.[1] ?? plain?.[1] ?? null;
  if (raw == null) return null;
  try { raw = decodeURIComponent(raw); } catch { /* keep as sent */ }
  const clean = raw.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '');
  return clean === '' ? null : clean;
}

function query(params: Record<string, string | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

async function download(path: string, token: string, fallbackName: string): Promise<CsvFile> {
  async function once(bearer: string): Promise<Response> {
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        headers: { Accept: 'text/csv', Authorization: `Bearer ${bearer}` },
      });
    } catch {
      throw new CsvExportError('offline');
    }
  }
  let response = await once(token);
  if (response.status === 401) {
    const fresh = await renewAccessToken();
    if (fresh != null) response = await once(fresh);
  }
  if (!response.ok) {
    if (response.status === 413) throw new CsvExportError('too_large');
    if (response.status === 403) throw new CsvExportError('forbidden');
    if (response.status === 404) throw new CsvExportError('not_found');
    throw new CsvExportError('failed');
  }
  const body = await response.text();
  return { filename: filenameFrom(response.headers.get('Content-Disposition')) ?? fallbackName, body };
}

/** One line's statement as CSV. `from` and `to` are 'YYYY-MM-DD' and optional (the server defaults to 90 days). */
export function fetchStatementCsv(
  token: string, agreementId: number, range: { from?: string | null; to?: string | null } = {},
): Promise<CsvFile> {
  return download(
    `/api/v1/credit/agreements/${agreementId}/statement.csv${query({ from: range.from, to: range.to })}`,
    token, `statement-${agreementId}.csv`);
}

/** The store's collections as CSV, for the Payouts screen to offer. */
export function fetchCollectionsCsv(
  token: string, storeId: number,
  params: { from?: string | null; to?: string | null; source?: string | null } = {},
): Promise<CsvFile> {
  return download(
    `/api/v1/supplier-stores/${storeId}/credit/collections.csv${query(params)}`,
    token, `collections-${storeId}.csv`);
}

/**
 * Hand a CSV to the person. On the web it downloads through the browser. On a phone it is written
 * to the cache folder under its own name and opened in the share sheet; a device that cannot
 * share says so (`unavailable`) rather than doing nothing.
 */
export async function shareCsv(file: CsvFile): Promise<void> {
  if (Platform.OS === 'web') {
    saveBlobOnWeb(new Blob([file.body], { type: 'text/csv;charset=utf-8' }), file.filename);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new CsvExportError('unavailable');
  let uri: string;
  try {
    const target = new File(Paths.cache, file.filename);
    if (target.exists) target.delete();
    target.create();
    target.write(file.body);
    uri = target.uri;
  } catch {
    throw new CsvExportError('failed');
  }
  try {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export statement', UTI: 'public.comma-separated-values-text' });
  } catch {
    throw new CsvExportError('failed');
  }
}

/** The whole export: fetch the statement CSV, then share it. Throws a {@link CsvExportError}. */
export async function exportStatementCsv(
  token: string, agreementId: number, range: { from?: string | null; to?: string | null } = {},
): Promise<CsvFile> {
  const file = await fetchStatementCsv(token, agreementId, range);
  await shareCsv(file);
  return file;
}
