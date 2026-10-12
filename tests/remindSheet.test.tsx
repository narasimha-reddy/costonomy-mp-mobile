import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RemindSheet } from '@/components/credit/RemindSheet';
import { ReminderHistory } from '@/components/credit/ReminderHistory';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { fetchReminders, previewReminder, sendReminder } from '@/services/credit';

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  previewReminder: jest.fn(),
  sendReminder: jest.fn(),
  fetchReminders: jest.fn(),
}));
const previewM = previewReminder as jest.Mock;
const sendM = sendReminder as jest.Mock;
const listM = fetchReminders as jest.Mock;

const inv = (id: number, over: Record<string, unknown> = {}) => ({
  invoiceId: id, invoiceNumber: `INV-${id}`, outstanding: '6500.0000', dueDate: '2026-09-24', dueState: 'OVERDUE',
  included: true, skipReason: null, ...over,
});
const preview = (over: Record<string, unknown> = {}) => ({
  canRemind: true, reason: null, nextAllowedAt: null,
  message: 'Sri Dairy: ₹6,500 overdue since 24 Sep (INV-41). Pay in Mandi or tell them you paid.',
  channels: ['IN_APP', 'PUSH'], status: 'SENT', sendAt: null, invoices: [inv(41)], ...over,
});
const REMINDER = {
  id: 7, agreementId: 3, kind: 'MANUAL', status: 'SENT', channels: ['IN_APP', 'PUSH'], message: 'm', note: null,
  invoiceIds: [41], skipped: [], requestedAt: '2026-10-06T10:00:00Z', sendAt: null, sentAt: '2026-10-06T10:00:00Z', createdBy: 1,
};
const err = (code: string, status: number, details?: Record<string, unknown>, message = 'server words') =>
  new ApiError({ code, status, message, details });

const onClose = jest.fn();
const onSent = jest.fn();
function renderSheet(offline = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RemindSheet visible onClose={onClose} agreementId={3} offline={offline} onSent={onSent} />
    </QueryClientProvider>,
  );
}
const send = () => screen.getByTestId('remind-send');

afterEach(cleanup);
beforeEach(() => { jest.clearAllMocks(); [previewM, sendM, listM].forEach((m) => m.mockReset()); previewM.mockResolvedValue(preview()); sendM.mockResolvedValue(REMINDER); });

describe('RemindSheet preview', () => {
  it('shows the exact message, the channels in words and the included invoices', async () => {
    renderSheet();
    expect(await screen.findByText(/Sri Dairy: ₹6,500 overdue since 24 Sep/)).toBeTruthy();
    expect(screen.getByTestId('remind-channels').props.children).toBe('In the app and as a notification');
    expect(screen.getByTestId('remind-invoice-41')).toBeTruthy();
    expect(screen.getByText('Due 24th Sep')).toBeTruthy();
    expect(screen.queryByTestId('remind-queued')).toBeNull();
    expect(send().props.accessibilityState?.disabled).toBeFalsy();
  });

  it('adds the SMS when the server says it is overdue', async () => {
    previewM.mockResolvedValue(preview({ channels: ['IN_APP', 'PUSH', 'SMS'] }));
    renderSheet();
    expect((await screen.findByTestId('remind-channels')).props.children)
      .toBe('In the app and as a notification, and an SMS because it is overdue');
  });

  it('says when a queued reminder will go, from the server time in IST', async () => {
    previewM.mockResolvedValue(preview({ status: 'QUEUED', sendAt: '2026-10-07T03:30:00Z' }));
    renderSheet();
    expect((await screen.findByTestId('remind-queued')).props.children).toBe('It will be sent at 9 am on 7th Oct.');
    expect(screen.getByText('Schedule reminder')).toBeTruthy();
  });

  it('lists the invoices left out, each with its plain reason', async () => {
    previewM.mockResolvedValue(preview({ invoices: [
      inv(41), inv(42, { included: false, skipReason: 'CLAIM_SUBMITTED' }),
      inv(43, { included: false, skipReason: 'NOT_DUE', dueState: 'NOT_DUE', dueDate: '2026-11-20' }),
    ] }));
    renderSheet();
    await screen.findByTestId('remind-skipped');
    expect(screen.getByText('They already say they paid this')).toBeTruthy();
    expect(screen.getByText('Not due yet')).toBeTruthy();
  });

  it.each([
    ['NOTHING_DUE', null, /nothing is due/i],
    ['CLAIM_COVERED', null, /say they have paid/i],
    ['TOO_SOON', '2026-10-07T10:00:00Z', /You can remind again at 3:30 pm on 7th Oct\./],
    ['WEEK_LIMIT', '2026-10-09T04:00:00Z', /3 reminders a week/],
    ['STORE_DAY_LIMIT', '2026-10-07T03:30:00Z', /50 reminders a day/],
  ])('%s: explains why, and Send stays off and never reaches the server', async (reason, next, words) => {
    previewM.mockResolvedValue(preview({ canRemind: false, reason, nextAllowedAt: next, status: null }));
    renderSheet();
    expect(await screen.findByTestId('remind-blocked')).toBeTruthy();
    expect(screen.getByTestId('remind-blocked').findByProps).toBeDefined();
    expect(screen.getByText(words)).toBeTruthy();
    expect(send().props.accessibilityState?.disabled).toBe(true);
    await act(async () => { fireEvent.press(send()); });
    expect(sendM).not.toHaveBeenCalled();
    expect(screen.queryByTestId('remind-note')).toBeNull();
  });

  it('shows an error with retry when the preview cannot load', async () => {
    previewM.mockRejectedValueOnce(new NetworkError()).mockResolvedValue(preview());
    renderSheet();
    expect(await screen.findByTestId('remind-preview-error')).toBeTruthy();
    expect(send().props.accessibilityState?.disabled).toBe(true);
    await act(async () => { fireEvent.press(screen.getByText('Try again')); });
    expect(await screen.findByTestId('remind-message')).toBeTruthy();
  });
});

describe('RemindSheet note and send', () => {
  it('counts the note out of 300 and stops at 300', async () => {
    renderSheet();
    const field = await screen.findByTestId('remind-note');
    expect(screen.getByText('0/300')).toBeTruthy();
    fireEvent.changeText(field, 'x'.repeat(305));
    expect(screen.getByText('300/300')).toBeTruthy();
  });

  it('sends the trimmed note, then reports the reminder', async () => {
    renderSheet();
    fireEvent.changeText(await screen.findByTestId('remind-note'), '  please pay by Friday  ');
    await act(async () => { fireEvent.press(send()); });
    expect(sendM).toHaveBeenCalledWith('tok', 3, { note: 'please pay by Friday' }, expect.any(String));
    expect(onSent).toHaveBeenCalledWith(REMINDER);
  });

  it('sends no note field when it is empty', async () => {
    renderSheet();
    await screen.findByTestId('remind-message');
    await act(async () => { fireEvent.press(send()); });
    expect(sendM).toHaveBeenCalledWith('tok', 3, {}, expect.any(String));
  });

  it('a double tap reaches the server once', async () => {
    let finish!: (v: unknown) => void;
    sendM.mockReturnValue(new Promise((res) => { finish = res; }));
    renderSheet();
    await screen.findByTestId('remind-message');
    await act(async () => { fireEvent.press(send()); fireEvent.press(send()); });
    expect(sendM).toHaveBeenCalledTimes(1);
    await act(async () => { finish(REMINDER); });
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CREDIT_REMINDER_TOO_SOON', 429, { nextAllowedAt: '2026-10-07T10:00:00Z' }, 'You can remind again at 3:30 pm on 7th Oct.'],
    ['CREDIT_REMINDER_LIMIT', 429, { limit: 'WEEK', max: 3, nextAllowedAt: '2026-10-09T04:00:00Z' }, /3 reminders a week/],
    ['CREDIT_REMINDER_LIMIT', 429, { limit: 'STORE_DAY', max: 50, nextAllowedAt: '2026-10-07T03:30:00Z' }, /50 reminders a day/],
    ['CREDIT_REMINDER_NOT_NEEDED', 422, { reason: 'NOTHING_DUE', skipped: [] }, /nothing is due/i],
  ])('a %s refusal is said in plain words and the next try has a new key', async (code, status, details, words) => {
    sendM.mockRejectedValueOnce(err(code, status as number, details as Record<string, unknown>)).mockResolvedValue(REMINDER);
    renderSheet();
    await screen.findByTestId('remind-message');
    await act(async () => { fireEvent.press(send()); });
    const shown = screen.getByTestId('remind-error').props.children as string;
    if (typeof words === 'string') expect(shown).toBe(words); else expect(shown).toMatch(words);
    expect(onSent).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(send()); });
    expect(sendM.mock.calls[1][3]).not.toBe(sendM.mock.calls[0][3]);
  });

  it('keeps the same key after a dropped connection', async () => {
    sendM.mockRejectedValueOnce(new NetworkError()).mockResolvedValue(REMINDER);
    renderSheet();
    await screen.findByTestId('remind-message');
    await act(async () => { fireEvent.press(send()); });
    await act(async () => { fireEvent.press(send()); });
    expect(sendM.mock.calls[1][3]).toBe(sendM.mock.calls[0][3]);
  });

  it('is off while offline', async () => {
    renderSheet(true);
    await screen.findByTestId('remind-message');
    expect(send().props.accessibilityState?.disabled).toBe(true);
  });
});

describe('ReminderHistory', () => {
  function renderHistory() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ReminderHistory agreementId={3} /></QueryClientProvider>);
  }
  const page = (items: unknown[], hasNext = false) => ({ items, page: 0, size: 10, total: items.length, hasNext });

  it('stays collapsed and loads nothing until opened', () => {
    renderHistory();
    expect(listM).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reminder-7')).toBeNull();
  });

  it('lists date, kind, status and who for each reminder', async () => {
    listM.mockResolvedValue(page([
      REMINDER,
      { ...REMINDER, id: 8, kind: 'AUTO_WEEKLY', status: 'SENT', createdBy: null, sentAt: '2026-10-01T04:30:00Z' },
      { ...REMINDER, id: 9, kind: 'AUTO_T3', status: 'QUEUED', sentAt: null, sendAt: '2026-10-07T03:30:00Z', createdBy: null },
    ]));
    renderHistory();
    fireEvent.press(screen.getByTestId('reminders-toggle'));
    expect(await screen.findByTestId('reminder-7')).toBeTruthy();
    expect(screen.getByLabelText('6th Oct, Manual, Sent, Sent by your team')).toBeTruthy();
    expect(screen.getByLabelText('1st Oct, Weekly, Sent, Sent automatically')).toBeTruthy();
    expect(screen.getByLabelText('7th Oct, Automatic before due, Waiting to send, Sent automatically')).toBeTruthy();
  });

  it('says so when there are none', async () => {
    listM.mockResolvedValue(page([]));
    renderHistory();
    fireEvent.press(screen.getByTestId('reminders-toggle'));
    expect(await screen.findByTestId('reminders-empty')).toBeTruthy();
  });

  it('offers more when the server has more', async () => {
    listM.mockResolvedValueOnce(page([REMINDER], true)).mockResolvedValueOnce(page([{ ...REMINDER, id: 8 }]));
    renderHistory();
    fireEvent.press(screen.getByTestId('reminders-toggle'));
    fireEvent.press(await screen.findByTestId('reminders-more'));
    await waitFor(() => expect(screen.getByTestId('reminder-8')).toBeTruthy());
    expect(listM).toHaveBeenLastCalledWith('tok', 3, { page: 1, size: 10 });
  });

  it('shows an error with retry when it cannot load', async () => {
    listM.mockRejectedValue(new NetworkError());
    renderHistory();
    fireEvent.press(screen.getByTestId('reminders-toggle'));
    expect(await screen.findByText("Couldn't load the reminders.")).toBeTruthy();
  });
});
