import Constants from 'expo-constants';
import { simulateCheckout } from '@/services/payments';
import type { IntentPaymentIntent } from '@/models/intent';
import { Colors } from '@/theme';
import { openRazorpayCheckout } from './razorpayCheckout';
import { CheckoutUnavailable, type CheckoutResult } from './types';

/**
 * Take the customer through the provider's checkout for one payment intent.
 *
 * <p>Chosen by the intent's `provider`, which the server set — never by a build
 * flag. A build that thought it was on the mock while the server was on Razorpay
 * would call the simulation endpoint, which refuses outright against a real
 * provider; reading it off the intent means the two cannot disagree.
 *
 * <p>Ends at "which payment": the caller still confirms with the server, which
 * asks the provider what actually happened (doc 05 §14).
 */
export async function completeCheckout(
  token: string,
  intent: IntentPaymentIntent,
  description: string,
): Promise<CheckoutResult> {
  switch (intent.provider) {
    case 'MOCK':
      // The mock has no hosted checkout, so the server stands in for it — and
      // refuses unless it really is on the mock.
      return simulateCheckout(token, intent.paymentId);

    case 'RAZORPAY':
      if (intent.publicKey == null) {
        throw new CheckoutUnavailable('Payments are not set up for this order. Nothing has been charged.');
      }
      return openRazorpayCheckout({
        key: intent.publicKey,
        providerOrderId: intent.providerOrderId,
        // The visible product name lives in app.json, so a rename stays config.
        merchantName: Constants.expoConfig?.name ?? '',
        description,
        themeColor: Colors.primary,
      });

    default:
      throw new CheckoutUnavailable(
        'This version of the app cannot take this kind of payment. Please update the app.',
      );
  }
}
