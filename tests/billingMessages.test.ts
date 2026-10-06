import { ApiError } from '@/lib/api/errors';
import { billingFailureMessage, describeMissing } from '@/lib/billing/messages';
import {
  TAX_INVOICE_FEATURE_OFF, TAX_INVOICE_MISSING_GSTIN, TAX_INVOICE_MISSING_SEVERAL, TAX_INVOICE_NOT_READY,
} from './fixtures/catchWeightContract';

/** How the app's client turns the API's error envelope into an ApiError (`lib/api/client.ts`). */
const fromEnvelope = (envelope: { error: { code: string; message: string; details?: Record<string, unknown> } }, status: number) =>
  new ApiError({ code: envelope.error.code, message: envelope.error.message, status, details: envelope.error.details });

describe('what a failed billing call says', () => {
  it('names the missing GSTIN, in words', () => {
    const message = billingFailureMessage(fromEnvelope(TAX_INVOICE_MISSING_GSTIN, 422), 'fallback');
    expect(message).toBe("This invoice can't be issued yet. Add your GSTIN.");
  });

  it('lists every gap together, including which product lacks an HSN code', () => {
    const message = billingFailureMessage(fromEnvelope(TAX_INVOICE_MISSING_SEVERAL, 422), 'fallback');
    expect(message).toBe("This invoice can't be issued yet. Add your GSTIN, your store address, an HSN code for Chicken.");
  });

  it('shows the server\'s own sentence when the order is not ready for an invoice', () => {
    expect(billingFailureMessage(fromEnvelope(TAX_INVOICE_NOT_READY, 422), 'fallback'))
      .toBe('A tax invoice can be issued once the order is ready; this order is CONFIRMED.');
  });

  it('reads the feature being off (404 for everyone) as not available, not as a fault', () => {
    expect(billingFailureMessage(fromEnvelope(TAX_INVOICE_FEATURE_OFF, 404), 'fallback'))
      .toBe("Tax invoices aren't available for this order yet.");
  });

  it('uses the fallback for a failure that is not the API\'s', () => {
    expect(billingFailureMessage(new TypeError('Network request failed'), 'Could not generate tax invoice for this order.'))
      .toBe('Could not generate tax invoice for this order.');
  });

  it('shows a path it does not know as sent, never drops it', () => {
    expect(describeMissing('supplier.somethingNew')).toBe('supplier.somethingNew');
  });
});
