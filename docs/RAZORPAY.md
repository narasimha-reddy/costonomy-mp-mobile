# Razorpay checkout

The pay screen (`app/restaurant/pay/[orderId].tsx`) opens whichever checkout the
payment intent names — see `lib/payments/checkout.ts`. Against the local API on
the mock provider nothing here matters: the server's simulation stands in for a
checkout window, exactly as before.

Against Razorpay (`costonomy-mp-api/docs/RAZORPAY.md` covers the server side):

- **Web** loads Razorpay's checkout.js from `checkout.razorpay.com` on the first
  payment. Nothing to install or configure.
- **iOS and Android** use `react-native-razorpay`, which is native. It needs a
  development build — `npx expo prebuild`, then `npx expo run:ios` or
  `npx expo run:android`. Expo Go has no Razorpay module; the pay screen says the
  preview build cannot take payments instead of crashing.

What the client does and does not do (D-098 in the API repo):

- It sends **no amount**. Razorpay reads it from the order the server created,
  so no paise are computed here.
- Checkout returns a payment id and nothing more. The screen then calls
  `/payments/{id}/confirm`, and only the server's answer decides what is shown.
- Closing Razorpay's window returns to the review state, not to a failure.
  Nothing is known to have failed, and Razorpay refuses a second payment on an
  order already paid, so paying again from there cannot charge twice.
