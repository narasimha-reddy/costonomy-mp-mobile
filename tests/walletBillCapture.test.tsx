import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BillScreen from '@/app/restaurant/wallet/transaction/bill';
import { MandiToastProvider } from '@/components/common';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { uploadWalletInvoice } from '@/services/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '184' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({ uploadWalletInvoice: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
let mockShrinkCount = 0;
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async () => ({ uri: `file:///shrunk-${++mockShrinkCount}.jpg`, width: 10, height: 10 })),
}));
jest.mock('expo-file-system', () => ({ File: class { size = 1000; } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Picker = require('expo-image-picker') as unknown as {
  requestCameraPermissionsAsync: jest.Mock;
  launchCameraAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Docs = require('expo-document-picker') as { getDocumentAsync: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Manip = require('expo-image-manipulator') as { manipulateAsync: jest.Mock };

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 805 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <BillScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const photo = (uri: string, w = 3000, h = 4000) => ({ uri, width: w, height: h, mimeType: 'image/jpeg', fileName: null });

async function addCameraPage(uri: string) {
  Picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [photo(uri)] });
  await act(async () => { fireEvent.press(screen.getByLabelText('Take photo')); });
}

const uploadDisabled = () => screen.getByTestId('upload-bill').props.accessibilityState.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  mockShrinkCount = 0;
  Picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
});

describe('Add bill screen', () => {
  it('has the three ways to add and the upload disabled while empty', () => {
    setup();
    expect(screen.getByText('Add bill')).toBeTruthy();
    expect(screen.getByLabelText('Take photo')).toBeTruthy();
    expect(screen.getByLabelText('Choose from gallery')).toBeTruthy();
    expect(screen.getByLabelText('Add PDF')).toBeTruthy();
    expect(uploadDisabled()).toBe(true);
    fireEvent.press(screen.getByTestId('upload-bill'));
    expect(uploadWalletInvoice).not.toHaveBeenCalled();
  });

  it('takes a photo with quality 0.8 and shows it in the page strip', async () => {
    setup();
    await addCameraPage('file:///a.jpg');
    expect(Picker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ quality: 0.8 }));
    expect(screen.getByTestId('bill-page-1')).toBeTruthy();
    expect(screen.getByText('Add another page')).toBeTruthy();
    expect(uploadDisabled()).toBe(false);
  });

  it('adds several gallery pages, removes one, and caps at five', async () => {
    setup();
    Picker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false, assets: [photo('file:///1.jpg'), photo('file:///2.jpg'), photo('file:///3.jpg')],
    });
    await act(async () => { fireEvent.press(screen.getByLabelText('Choose from gallery')); });
    expect(Picker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 5 }),
    );
    expect(screen.getByTestId('bill-page-3')).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByLabelText('Remove page 2')); });
    expect(screen.queryByTestId('bill-page-3')).toBeNull();
    expect(screen.getByTestId('bill-page-2')).toBeTruthy();

    Picker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false, assets: ['a', 'b', 'c', 'd'].map((n) => photo(`file:///${n}.jpg`)),
    });
    await act(async () => { fireEvent.press(screen.getByLabelText('Choose from gallery')); });
    expect(Picker.launchImageLibraryAsync).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 3 }));
    expect(screen.getByTestId('bill-page-5')).toBeTruthy();
    expect(screen.getByTestId('bill-notice').props.children).toMatch(/extra/);
    expect(screen.queryByLabelText('Take photo')).toBeNull();
  });

  it('shrinks photos, then uploads them as bill-1.jpg... with the outlet, entry and token, and goes back', async () => {
    (uploadWalletInvoice as jest.Mock).mockImplementation(async (_o, _e, _f, _t, onProgress) => {
      onProgress?.(0.5);
      return { status: 'READING' };
    });
    setup();
    await addCameraPage('file:///a.jpg');
    await addCameraPage('file:///b.jpg');
    await act(async () => { fireEvent.press(screen.getByTestId('upload-bill')); });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());

    // 3000x4000: the long side (height) is brought to 2000, JPEG at 0.8.
    expect(Manip.manipulateAsync).toHaveBeenCalledWith(
      'file:///a.jpg', [{ resize: { height: 2000 } }], { compress: 0.8, format: 'jpeg' },
    );
    const call = (uploadWalletInvoice as jest.Mock).mock.calls[0];
    expect(call.slice(0, 4)).toEqual([
      7, '184',
      [
        { uri: expect.stringMatching(/^file:\/\/\/shrunk-/), name: 'bill-1.jpg', type: 'image/jpeg' },
        { uri: expect.stringMatching(/^file:\/\/\/shrunk-/), name: 'bill-2.jpg', type: 'image/jpeg' },
      ],
      'token',
    ]);
    expect(typeof call[4]).toBe('function');
  });

  it('sends a PDF untouched', async () => {
    (uploadWalletInvoice as jest.Mock).mockResolvedValue({ status: 'READING' });
    Docs.getDocumentAsync.mockResolvedValueOnce({
      canceled: false, assets: [{ uri: 'file:///bill.pdf', name: 'bill.pdf', mimeType: 'application/pdf', size: 1000 }],
    });
    setup();
    await act(async () => { fireEvent.press(screen.getByLabelText('Add PDF')); });
    expect(screen.getByText('PDF')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('upload-bill')); });
    await waitFor(() => expect(uploadWalletInvoice).toHaveBeenCalled());
    expect((uploadWalletInvoice as jest.Mock).mock.calls[0][2]).toEqual([
      { uri: 'file:///bill.pdf', name: 'bill.pdf', type: 'application/pdf' },
    ]);
    expect(Manip.manipulateAsync).not.toHaveBeenCalled();
  });

  it('refuses a file of the wrong type in plain words', async () => {
    Docs.getDocumentAsync.mockResolvedValueOnce({
      canceled: false, assets: [{ uri: 'file:///x.xlsx', name: 'x.xlsx', mimeType: 'application/vnd.ms-excel', size: 10 }],
    });
    setup();
    await act(async () => { fireEvent.press(screen.getByLabelText('Add PDF')); });
    expect(screen.getByTestId('bill-notice').props.children).toMatch(/not supported/);
    expect(uploadDisabled()).toBe(true);
  });

  it('keeps the pages and offers Try again after an offline failure, then succeeds', async () => {
    (uploadWalletInvoice as jest.Mock)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({ status: 'READING' });
    setup();
    await addCameraPage('file:///a.jpg');
    await act(async () => { fireEvent.press(screen.getByTestId('upload-bill')); });
    expect(await screen.findByText(/seem to be offline/)).toBeTruthy();
    expect(screen.getByTestId('bill-page-1')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    const shrunkBefore = Manip.manipulateAsync.mock.calls.length;

    await act(async () => { fireEvent.press(screen.getByLabelText('Try again')); });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(uploadWalletInvoice).toHaveBeenCalledTimes(2);
    // The shrunk copy is reused; the photo is not processed twice.
    expect(Manip.manipulateAsync.mock.calls.length).toBe(shrunkBefore);
  });

  it.each([
    [409, 'INVOICE_EXISTS', /already has a bill/],
    [422, 'PAYMENT_KIND', /made from your wallet/],
    [429, 'DAILY_CAP', /today/],
    [415, 'UNSUPPORTED', /not supported/],
    [400, 'BAD_FILE', /5 MB/],
  ])('explains a %s error and keeps the pages', async (status, code, text) => {
    (uploadWalletInvoice as jest.Mock).mockRejectedValueOnce(new ApiError({ code, message: 'raw', status }));
    setup();
    await addCameraPage('file:///a.jpg');
    await act(async () => { fireEvent.press(screen.getByTestId('upload-bill')); });
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByTestId('bill-page-1')).toBeTruthy();
  });

  it('does not crash when the camera is not available', async () => {
    Picker.launchCameraAsync.mockRejectedValueOnce(new Error('no camera'));
    setup();
    await act(async () => { fireEvent.press(screen.getByLabelText('Take photo')); });
    expect(screen.getByTestId('bill-notice').props.children).toMatch(/camera is not available/i);
  });
});
