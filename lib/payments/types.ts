/**
 * What opening a provider's checkout needs, and what it can end in.
 *
 * <p>Deliberately no amount. Razorpay reads it from the order the server created,
 * so the client never states one — sending paise from here would be the app doing
 * money arithmetic, which it does not do (`utils/money.ts`).
 */
export interface CheckoutRequest {
  /** The provider's publishable key, from the payment intent. Never a secret. */
  key: string;
  /** The provider order the server minted for this payment. */
  providerOrderId: string;
  /** Shown as the merchant in the provider's window. From `app.json`, never a literal. */
  merchantName: string;
  description: string;
  themeColor: string;
  /**
   * Opens the window on this method and hides net banking, wallets, pay later and EMI.
   * Only credit-dues payments set it; order pay and top-up leave it out and see everything.
   * It is a hint: the server accepts whatever is captured.
   */
  method?: 'upi' | 'card';
}

/** Razorpay options for a pre-selected method: prefill it, and hide the methods we do not offer. */
export function methodOptions(method: 'upi' | 'card' | undefined): {
  prefill?: { method: string };
  config?: { display: { hide: { method: string }[] } };
} {
  if (method == null) return {};
  return {
    prefill: { method },
    config: {
      display: {
        hide: [{ method: 'netbanking' }, { method: 'wallet' }, { method: 'paylater' }, { method: 'emi' }],
      },
    },
  };
}

/**
 * The only thing checkout tells us: which payment to ask the server about.
 * Whether it succeeded is the server's to say, after it asks the provider.
 */
export interface CheckoutResult {
  providerPaymentId: string;
  /**
   * The provider's proof for the payment, when it sends one. An order payment
   * ignores it (the server asks the provider itself); a wallet top-up passes it
   * on so the server can verify it before crediting.
   */
  providerSignature?: string;
}

/** The customer closed checkout without completing a payment. */
export class CheckoutDismissed extends Error {
  constructor() {
    super('The payment window was closed.');
    this.name = 'CheckoutDismissed';
  }
}

/**
 * This build cannot open the provider's checkout at all — Expo Go, which has no
 * native Razorpay module, or a browser that could not load Razorpay's script.
 */
export class CheckoutUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutUnavailable';
  }
}

/** The provider's checkout reported an error it could not recover from. */
export class CheckoutFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutFailed';
  }
}
