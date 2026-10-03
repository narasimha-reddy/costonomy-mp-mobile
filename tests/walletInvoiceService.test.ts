import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { renewAccessToken } from '@/lib/api/session-bridge';
import { uploadParts } from '@/lib/api/upload';
import {
  deleteWalletInvoice, fetchWalletInvoice, fetchWalletTransaction, uploadWalletInvoice,
} from '@/services/wallet';

jest.mock('@/lib/api/client', () => ({ apiRequest: jest.fn() }));
jest.mock('@/lib/api/upload', () => ({ uploadParts: jest.fn() }));
jest.mock('@/lib/api/session-bridge', () => ({ renewAccessToken: jest.fn() }));

const files = [{ uri: 'file:///a.jpg', name: 'bill-1.jpg', type: 'image/jpeg' }];

beforeEach(() => jest.clearAllMocks());

describe('wallet invoice service', () => {
  it('gets the bill from the invoice path', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ status: 'READ', pages: [{ page: 1 }] });
    const invoice = await fetchWalletInvoice(7, 184, 'tok');
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/outlets/7/wallet/transactions/184/invoice', { token: 'tok' });
    expect(invoice.pages).toHaveLength(1);
  });

  it('deletes the bill', async () => {
    (apiRequest as jest.Mock).mockResolvedValue(undefined);
    await deleteWalletInvoice(7, '184', 'tok');
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/outlets/7/wallet/transactions/184/invoice', { token: 'tok', method: 'DELETE' },
    );
  });

  it('uploads the files with progress to the invoice path', async () => {
    (uploadParts as jest.Mock).mockResolvedValue({ status: 'READING' });
    const onProgress = jest.fn();
    await uploadWalletInvoice(7, '184', files, 'tok', onProgress);
    expect(uploadParts).toHaveBeenCalledWith('/api/v1/outlets/7/wallet/transactions/184/invoice', files, 'tok', onProgress);
  });

  it('renews an expired token once and uploads again; other errors pass through', async () => {
    (uploadParts as jest.Mock)
      .mockRejectedValueOnce(new ApiError({ code: 'UNAUTHENTICATED', message: 'x', status: 401 }))
      .mockResolvedValueOnce({ status: 'READING' });
    (renewAccessToken as jest.Mock).mockResolvedValue('fresh');
    await uploadWalletInvoice(7, '184', files, 'old');
    expect((uploadParts as jest.Mock).mock.calls[1][2]).toBe('fresh');

    (uploadParts as jest.Mock).mockRejectedValueOnce(new ApiError({ code: 'INVOICE_EXISTS', message: 'x', status: 409 }));
    await expect(uploadWalletInvoice(7, '184', files, 'tok')).rejects.toMatchObject({ status: 409 });
  });

  it('the transaction detail carries invoice and canAddBill, defaulting to none', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({
      transactionId: '184', actions: { canPayAgain: false, canAddBill: true },
      invoice: { status: 'READING', vendorName: null, total: null, thumbnailUrl: null },
    });
    const withBill = await fetchWalletTransaction(7, 184, 'tok');
    expect(withBill.actions.canAddBill).toBe(true);
    expect(withBill.invoice?.status).toBe('READING');
    (apiRequest as jest.Mock).mockResolvedValue({ transactionId: '1' });
    expect((await fetchWalletTransaction(7, 1, 'tok')).invoice).toBeNull();
  });
});
