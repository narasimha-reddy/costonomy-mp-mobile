import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import {
  CsvExportError, exportStatementCsv, fetchCollectionsCsv, fetchStatementCsv, filenameFrom, shareCsv,
} from '@/services/creditExport';
import { renewAccessToken } from '@/lib/api/session-bridge';
import { saveBlobOnWeb } from '@/lib/wallet/saveFile';

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));
const mockWrite = jest.fn();
const mockCreate = jest.fn();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    create() { mockCreate(this.uri); }
    write(text: string) { mockWrite(this.uri, text); }
    delete() {}
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('@/lib/wallet/saveFile', () => ({ saveBlobOnWeb: jest.fn() }));
jest.mock('@/lib/api/session-bridge', () => ({ renewAccessToken: jest.fn() }));

const fetchM = jest.fn();
const response = (status: number, body = '', headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300, status, text: async () => body,
  headers: { get: (k: string) => headers[k] ?? null },
});

beforeEach(() => {
  jest.clearAllMocks();
  (global as unknown as { fetch: unknown }).fetch = fetchM;
  fetchM.mockReset();
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
  (renewAccessToken as jest.Mock).mockResolvedValue(null);
  (Platform as { OS: string }).OS = 'ios';
});

describe('filenameFrom', () => {
  it('reads the server file name and refuses path tricks', () => {
    expect(filenameFrom('attachment; filename="statement-Spice-2026-07-01-2026-10-01.csv"')).toBe('statement-Spice-2026-07-01-2026-10-01.csv');
    expect(filenameFrom("attachment; filename*=UTF-8''st%C3%A4t.csv")).toBe('stät.csv');
    expect(filenameFrom('attachment; filename="../../etc/passwd"')).not.toMatch(/[\\/]/);
    expect(filenameFrom(null)).toBeNull();
    expect(filenameFrom('attachment')).toBeNull();
  });
});

describe('fetching', () => {
  it('asks for the statement CSV with the bearer token and the range, and keeps the server file name', async () => {
    fetchM.mockResolvedValue(response(200, 'a,b\n1,2\n', { 'Content-Disposition': 'attachment; filename="statement-x.csv"' }));
    const file = await fetchStatementCsv('tok', 3, { from: '2026-07-01', to: '2026-10-01' });
    const [url, init] = fetchM.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/credit\/agreements\/3\/statement\.csv\?from=2026-07-01&to=2026-10-01$/);
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(file).toEqual({ filename: 'statement-x.csv', body: 'a,b\n1,2\n' });
  });

  it('leaves the query off when there is no range, and falls back to its own file name', async () => {
    fetchM.mockResolvedValue(response(200, 'x'));
    const file = await fetchStatementCsv('tok', 3);
    expect(String(fetchM.mock.calls[0][0])).toMatch(/statement\.csv$/);
    expect(file.filename).toBe('statement-3.csv');
  });

  it('fetches the collections CSV with its source (for the Payouts screen)', async () => {
    fetchM.mockResolvedValue(response(200, 'x'));
    await fetchCollectionsCsv('tok', 5, { from: '2026-10-01', source: 'WALLET' });
    expect(String(fetchM.mock.calls[0][0])).toMatch(/\/supplier-stores\/5\/credit\/collections\.csv\?from=2026-10-01&source=WALLET$/);
  });

  it('413 says to pick a shorter period', async () => {
    fetchM.mockResolvedValue(response(413));
    await expect(fetchStatementCsv('tok', 3)).rejects.toMatchObject({ kind: 'too_large', message: 'Too many rows. Pick a shorter period.' });
  });

  it('a dropped connection is offline, in words', async () => {
    fetchM.mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchStatementCsv('tok', 3)).rejects.toMatchObject({ kind: 'offline' });
  });

  it.each([[403, 'forbidden'], [404, 'not_found'], [500, 'failed']])('%s is %s', async (status, kind) => {
    fetchM.mockResolvedValue(response(status as number));
    await expect(fetchStatementCsv('tok', 3)).rejects.toMatchObject({ kind });
  });

  it('renews an expired token once and tries again', async () => {
    (renewAccessToken as jest.Mock).mockResolvedValue('fresh');
    fetchM.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, 'ok'));
    const file = await fetchStatementCsv('old', 3);
    expect(fetchM.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
    expect(file.body).toBe('ok');
  });
});

describe('sharing', () => {
  it('writes the text to the cache under the file name and opens the share sheet', async () => {
    await shareCsv({ filename: 'statement-x.csv', body: 'a,b' });
    expect(mockWrite).toHaveBeenCalledWith('file:///cache/statement-x.csv', 'a,b');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/statement-x.csv', expect.objectContaining({ mimeType: 'text/csv' }));
  });

  it('says so when this device cannot share, and writes nothing', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await expect(shareCsv({ filename: 'x.csv', body: 'a' })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('says it failed when the file cannot be written', async () => {
    mockWrite.mockImplementationOnce(() => { throw new Error('disk'); });
    await expect(shareCsv({ filename: 'x.csv', body: 'a' })).rejects.toBeInstanceOf(CsvExportError);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('on the web it downloads through the browser instead', async () => {
    (Platform as { OS: string }).OS = 'web';
    await shareCsv({ filename: 'x.csv', body: 'a,b' });
    expect(saveBlobOnWeb).toHaveBeenCalledWith(expect.any(Blob), 'x.csv');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('exportStatementCsv fetches then shares, and shares nothing when the fetch fails', async () => {
    fetchM.mockResolvedValue(response(200, 'a,b', { 'Content-Disposition': 'attachment; filename="s.csv"' }));
    await exportStatementCsv('tok', 3, {});
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    fetchM.mockResolvedValue(response(413));
    await expect(exportStatementCsv('tok', 3, {})).rejects.toBeInstanceOf(CsvExportError);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });
});
