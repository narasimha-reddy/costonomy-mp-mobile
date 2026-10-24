import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
const mockCopy = jest.fn();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    copy(dest: unknown) { mockCopy(this.uri, dest); }
    delete() {}
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shareReceiptImage } = require('@/lib/wallet/shareReceipt') as typeof import('@/lib/wallet/shareReceipt');

describe('shareReceiptImage (native)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('captures a 1080 px wide png, copies it to the cache by name and opens the share sheet', async () => {
    (captureRef as jest.Mock).mockResolvedValue('file:///tmp/snap.png');
    await shareReceiptImage({ the: 'view' }, 'costonomy-receipt-184.png', 200);
    expect(captureRef).toHaveBeenCalledWith({ the: 'view' }, expect.objectContaining({
      format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 600,
    }));
    expect(mockCopy).toHaveBeenCalledWith('file:///tmp/snap.png', expect.anything());
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/costonomy-receipt-184.png',
      { mimeType: 'image/png', dialogTitle: 'Share receipt', UTI: 'public.png' },
    );
  });

  it('shares the capture under its own name when the copy fails', async () => {
    (captureRef as jest.Mock).mockResolvedValue('file:///tmp/snap.png');
    mockCopy.mockImplementationOnce(() => { throw new Error('disk'); });
    await shareReceiptImage({}, 'costonomy-receipt-1.png');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/snap.png', expect.objectContaining({ mimeType: 'image/png' }));
  });

  it('throws when the capture fails, so the screen can say so', async () => {
    (captureRef as jest.Mock).mockRejectedValue(new Error('no view'));
    await expect(shareReceiptImage({}, 'x.png')).rejects.toThrow('no view');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
