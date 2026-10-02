/* global __dirname */
// Razorpay TEST-mode end-to-end suite for the local stack.
// Card flows are driven through the real web app and Razorpay's real checkout;
// every test asserts the effect — our DB and Razorpay's own record — not only the
// message on screen. Usage: node suite.js [filter]
const crypto = require('crypto');
const fs = require('fs');
const L = require('./lib');

const CARDS = {
  visaDomestic: '4100280000001007',
  mastercardDomestic: '5555510000081006',
  visaInternational: '4012888888881881',
};

const results = [];
const only = process.argv[2];
let b;

/**
 * `retries` is for the card flows only, where Razorpay's test infrastructure is
 * itself variable (it may route the same card through a bank page or an OTP, and
 * the OTP can hang at "Sending OTP"). A retry is always reported, with the reason
 * the first attempt failed — a pass after a retry is not a clean pass.
 */
async function test(id, name, fn, { retries = 0 } = {}) {
  // `node suite.js C1,R4` runs several; cases that reuse a payment need its maker too.
  if (only && !only.split(',').some((prefix) => id.startsWith(prefix))) return;
  const started = Date.now();
  process.stdout.write(`${id}  ${name} ... `);
  const failures = [];
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const detail = await fn();
      const note = failures.length ? ` [after ${failures.length} retry: ${failures[0].slice(0, 120)}]` : '';
      results.push({ id, name, ok: true, retried: failures.length, detail: (detail || '') + note,
        secs: Math.round((Date.now() - started) / 1000) });
      console.log('PASS' + (detail ? `  (${detail})` : '') + note);
      return;
    } catch (e) {
      failures.push(e.message);
    }
  }
  results.push({ id, name, ok: false, detail: failures.join(' || '), secs: Math.round((Date.now() - started) / 1000) });
  console.log('FAIL  ' + failures.join(' || '));
}

function expect(cond, message) { if (!cond) throw new Error(message); }

// ── checkout driving ──────────────────────────────────────────────────

/** Open the pay screen for a fresh accepted request, and tap Pay. Returns page + ids. */
async function openCheckout({ block } = {}) {
  const intentId = await L.acceptedRequest(1);
  const page = await L.signedInPage(b, `/restaurant/requests/${intentId}`);
  page.on('dialog', (d) => d.accept());
  if (block) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (block(r.url()) ? r.abort() : r.continue()));
  }
  await L.tap(page, 'Create Order');
  await page.waitForFunction(() => location.pathname.startsWith('/restaurant/pay/'), { timeout: 20000 });
  const orderId = Number(await page.evaluate(() => location.pathname.split('/').pop()));
  const paymentId = L.paymentIdForOrder(orderId);
  await L.tap(page, 'Pay ');
  return { page, orderId, paymentId, providerOrderId: L.db(`select provider_order_id from payment where id=${paymentId}`) };
}

const checkoutFrame = (page) => L.until(
  () => page.frames().find((f) => f.url().includes('api.razorpay.com/v1/checkout')),
  { timeout: 30000, what: "Razorpay's checkout" });

/** Contact (if asked), Cards, the card itself, past the save-card prompt. Returns the bank popup. */
async function submitCard(page, frame, number) {
  lastFrame = frame;
  const context = page.browserContext();
  const seen = new Set(context.targets().filter((t) => t.url().includes('/v1/gateway')));
  // The popup opens as about:blank and navigates afterwards, so poll for the URL
  // rather than matching it at creation.
  // Razorpay authenticates one of two ways: a demo bank page in a popup, or an
  // OTP screen inside checkout (e.g. HDFC-issued test cards). Whichever appears.
  const auth = L.until(async () => {
    const t = context.targets().find((x) => x.type() === 'page'
      && x.url().includes('api.razorpay.com/v1/gateway') && !seen.has(x));
    if (t) return { popup: await t.page() };
    const otp = await frame.evaluate(() => {
      const i = document.querySelector('input[name=otp]'); return !!(i && i.offsetParent !== null);
    }).catch(() => false);
    if (otp) return { otp: true };
    // The save-card prompt can arrive late and sit over the OTP screen.
    await frame.evaluate(() => {
      const m = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && e.textContent.trim() === 'Maybe later');
      m && m.click();
    }).catch(() => {});
    return null;
  }, { timeout: 60000, every: 700, what: 'authentication step' }).catch(() => ({}));
  const hasContact = await frame.waitForSelector('input[name=contact]', { visible: true, timeout: 8000 })
    .then(() => true).catch(() => false);
  if (hasContact) {
    await L.ftype(frame, 'input[name=contact]', '9876500004');
    await frame.evaluate(() => [...document.querySelectorAll('button')]
      .find((e) => e.offsetParent !== null && e.textContent.trim() === 'Continue').click());
  }
  await L.fclick(frame, '[data-testid=card]');
  await L.ftype(frame, 'input[name="card.number"]', number);
  await L.ftype(frame, 'input[name="card.expiry"]', '1230');
  await L.ftype(frame, 'input[name="card.cvv"]', '123');
  // International cards also ask for a name and an email; fill whatever is asked.
  await L.sleep(800);
  const extra = await frame.evaluate(() => [...document.querySelectorAll('input')]
    .filter((i) => i.offsetParent !== null && !i.value && /name on card|email/i.test(i.placeholder || ''))
    .map((i) => ({ sel: i.name ? `input[name="${i.name}"]` : `input[placeholder="${i.placeholder}"]`, email: /email/i.test(i.placeholder) })));
  for (const f of extra) await L.ftype(frame, f.sel, f.email ? 'payer@example.com' : 'Test Payer');
  await L.fclick(frame, '[data-testid=bottom-cta-button]');
  // Razorpay may offer to save the card; decline it.
  for (let i = 0; i < 6; i++) {
    await L.sleep(1000);
    const clicked = await frame.evaluate(() => {
      const m = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && e.textContent.trim() === 'Maybe later');
      if (m) { m.click(); return true; } return false;
    }).catch(() => false);
    if (clicked) break;
  }
  return auth;
}

let lastFrame;
async function bank(popup, choice) {
  if (!popup) {
    const text = lastFrame ? (await frameText(lastFrame)).replace(/\s+/g, ' ')
      .replace(/(\d )+/g, '').replace(/₹ /g, '').slice(-400) : '';
    await snapshot(lastFrame.page(), 'no-bank-page');
    throw new Error("Razorpay's demo bank page never opened; checkout showed: " + text);
  }
  await popup.waitForFunction((c) => [...document.querySelectorAll('button')].some((e) => e.textContent.trim() === c),
    { timeout: 20000 }, choice);
  await popup.evaluate((c) => [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === c).click(), choice);
}

/** Netbanking with the first recommended bank, through Razorpay's demo bank page. */
async function payNetbanking(page, frame, outcome) {
  lastFrame = frame;
  const context = page.browserContext();
  const seen = new Set(context.targets().filter((t) => t.url().includes('/v1/gateway')));
  const hasContact = await frame.waitForSelector('input[name=contact]', { visible: true, timeout: 8000 })
    .then(() => true).catch(() => false);
  if (hasContact) {
    await L.ftype(frame, 'input[name=contact]', '9876500004');
    await frame.evaluate(() => [...document.querySelectorAll('button')]
      .find((e) => e.offsetParent !== null && e.textContent.trim() === 'Continue').click());
  }
  await frame.waitForSelector('[data-testid=netbanking]', { visible: true, timeout: 20000 });
  await L.sleep(500);
  const bankName = await frame.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid=netbanking]')]
      .find((e) => e.offsetParent !== null && /bank/i.test(e.textContent) && e.textContent.trim() !== 'Netbanking');
    el.click(); return el.textContent.trim();
  });
  await L.sleep(800);
  await L.fclick(frame, '[data-testid=bottom-cta-button]');
  const popup = await L.until(() => context.targets().find((t) => t.type() === 'page'
    && t.url().includes('api.razorpay.com/v1/gateway') && !seen.has(t)),
  { timeout: 45000, every: 500, what: 'bank page' }).then((t) => t.page()).catch(() => null);
  await bank(popup, outcome);
  return bankName;
}

/** Complete authentication with the given outcome, whichever way Razorpay asked for it. */
async function authenticate(page, frame, number, outcome) {
  const how = await submitCard(page, frame, number);
  if (how.popup) return bank(how.popup, outcome);
  if (how.otp) {
    // SANDBOX_SETUP.md: four or more digits succeed, fewer fail.
    await L.ftype(frame, 'input[name=otp]', outcome === 'Success' ? '123456' : '12');
    await frame.evaluate(() => {
      const btns = [...document.querySelectorAll('button[type=submit]')]
        .filter((e) => e.offsetParent !== null && e.textContent.trim() === 'Continue');
      btns[btns.length - 1].click();
    });
    return 'otp';
  }
  return bank(null, outcome);
}

const frameText = (frame) => frame.evaluate(() => document.body.innerText).catch(() => '');

/**
 * Close Razorpay's window the way a person would: the back arrow (on the first
 * screen it exits; deeper in, it steps back), then "Yes, exit" on the
 * confirmation our confirm_close option asks for.
 */
async function dismiss(page, frame) {
  for (let i = 0; i < 6; i++) {
    const confirmed = await frame.evaluate(() => {
      const yes = document.querySelector('[data-testid=confirm-positive]');
      if (yes && yes.offsetParent !== null) { yes.click(); return true; }
      return false;
    }).catch(() => false);
    if (confirmed) return;
    await L.fclick(frame, '[data-testid=nav-back]', { timeout: 5000 }).catch(() => {});
    await L.sleep(1500);
  }
  throw new Error("could not close Razorpay's window");
}

async function screenText(page, pattern, timeout = 30000) {
  await page.waitForFunction((p) => new RegExp(p).test(document.body.innerText), { timeout }, pattern.source);
}

async function snapshot(page, name) {
  await page.screenshot({ path: `${__dirname}/shots/${name}.png` }).catch(() => {});
}

async function rzpPaymentsFor(providerOrderId) {
  return (await L.rzp(`/v1/orders/${providerOrderId}/payments`)).items || [];
}

// ── the suite ─────────────────────────────────────────────────────────

// A captured payment reused by the server-side cases — from whichever card test
// succeeded first, so one flaky card run does not take eight other cases with it.
let paid;
function markPaid(orderId, paymentId, providerOrderId) {
  if (paid) return;
  const row = L.paymentRow(paymentId);
  paid = { orderId, paymentId, providerPaymentId: row.providerPaymentId, providerOrderId, amount: row.captured };
}

(async () => {
  fs.mkdirSync(`${__dirname}/shots`, { recursive: true });
  b = await L.browser();

  // ── Card flows through the real UI ──

  await test('C1', 'domestic Visa, bank Success → order funded, captured by us', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Success');
      await screenText(page, /Payment authorised/);
      await snapshot(page, 'C1-success');
      // Razorpay's side of "held": authorised, not captured, until ready.
      const heldAt = await L.rzp(`/v1/payments/${L.paymentRow(paymentId).providerPaymentId}`);
      expect(heldAt.status === 'authorized', 'razorpay before ready: ' + heldAt.status);
      // Held, not taken, until the supplier marks it ready (D-103).
      expect(L.paymentRow(paymentId).status === 'AUTHORIZED', 'not held: ' + L.paymentRow(paymentId).status);
      await L.dispatch(orderId);
      await L.until(() => L.paymentRow(paymentId).status === 'CAPTURED', { timeout: 40000, what: 'capture job' });
      const row = L.paymentRow(paymentId);
      expect(L.orderStatus(orderId) === 'READY_FOR_PICKUP', 'order is ' + L.orderStatus(orderId));
      const rp = await L.rzp(`/v1/payments/${row.providerPaymentId}`);
      expect(rp.status === 'captured' && rp.order_id === providerOrderId, `razorpay says ${rp.status} / ${rp.order_id}`);
      expect(rp.amount === Math.round(Number(row.captured) * 100), `amount ${rp.amount} vs ${row.captured}`);
      markPaid(orderId, paymentId, providerOrderId);
      return `${row.providerPaymentId}, ₹${Number(row.captured).toFixed(2)} captured`;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('C2', 'domestic Mastercard, in-checkout OTP (4+ digits) → funded', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.mastercardDomestic, 'Success');
      await screenText(page, /Payment authorised/);
      // Held, not taken, until the supplier marks it ready (D-103).
      expect(L.paymentRow(paymentId).status === 'AUTHORIZED', 'not held: ' + L.paymentRow(paymentId).status);
      await L.dispatch(orderId);
      await L.until(() => L.paymentRow(paymentId).status === 'CAPTURED', { timeout: 40000, what: 'capture' });
      expect(L.orderStatus(orderId) === 'READY_FOR_PICKUP', 'order ' + L.orderStatus(orderId));
      markPaid(orderId, paymentId, providerOrderId);
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F7', 'Mastercard with a wrong OTP (<4 digits) → refused, order payable', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.mastercardDomestic, 'Failure');
      await L.until(async () => /fail|retry|try again|incorrect|invalid/i.test(await frameText(frame)),
        { timeout: 30000, what: 'OTP failure shown' });
      await snapshot(page, 'F7-otp-failed');
      await dismiss(page, frame);
      await screenText(page, /payment window was closed/i);
      expect(L.paymentRow(paymentId).status === 'CREATED', 'payment ' + L.paymentRow(paymentId).status);
      expect(L.orderStatus(orderId) === 'DRAFT', 'order ' + L.orderStatus(orderId));
      const attempts = await rzpPaymentsFor(providerOrderId);
      expect(attempts.every((p) => p.status !== 'authorized' && p.status !== 'captured'),
        'razorpay: ' + attempts.map((p) => p.status).join(','));
      return `razorpay attempts: ${attempts.map((p) => p.status).join(',') || 'none'}`;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('C3', 'netbanking, bank Success → funded', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      const bankName = await payNetbanking(page, frame, 'Success');
      await screenText(page, /Payment authorised/);
      // Held, not taken, until the supplier marks it ready (D-103).
      expect(L.paymentRow(paymentId).status === 'AUTHORIZED', 'not held: ' + L.paymentRow(paymentId).status);
      await L.dispatch(orderId);
      await L.until(() => L.paymentRow(paymentId).status === 'CAPTURED', { timeout: 40000, what: 'capture' });
      expect(L.orderStatus(orderId) === 'READY_FOR_PICKUP', 'order ' + L.orderStatus(orderId));
      const rp = await L.rzp(`/v1/payments/${L.paymentRow(paymentId).providerPaymentId}`);
      expect(rp.method === 'netbanking' && rp.status === 'captured' && rp.order_id === providerOrderId,
        `razorpay ${rp.method} ${rp.status}`);
      markPaid(orderId, paymentId, providerOrderId);
      return bankName;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F8', 'netbanking, bank Failure, close → nothing funded', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await payNetbanking(page, frame, 'Failure');
      await L.until(async () => /fail|retry|try again/i.test(await frameText(frame)), { timeout: 30000, what: 'failure shown' });
      await dismiss(page, frame);
      await screenText(page, /payment window was closed/i);
      expect(L.paymentRow(paymentId).status === 'CREATED', 'payment ' + L.paymentRow(paymentId).status);
      expect(L.orderStatus(orderId) === 'DRAFT', 'order ' + L.orderStatus(orderId));
      const attempts = await rzpPaymentsFor(providerOrderId);
      expect(attempts.length >= 1 && attempts.every((p) => p.status === 'failed'), 'razorpay: ' + attempts.map((p) => p.status));
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F1', 'bank Failure, then close checkout → nothing funded, order payable', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Failure');
      await L.until(async () => /fail|retry|try again/i.test(await frameText(frame)), { timeout: 30000, what: 'failure shown in checkout' });
      await snapshot(page, 'F1-failed-in-checkout');
      await dismiss(page, frame);
      await screenText(page, /payment window was closed/i);
      await snapshot(page, 'F1-back-to-review');
      expect(L.paymentRow(paymentId).status === 'CREATED', 'payment ' + L.paymentRow(paymentId).status);
      expect(L.orderStatus(orderId) === 'DRAFT', 'order ' + L.orderStatus(orderId));
      const attempts = await rzpPaymentsFor(providerOrderId);
      expect(attempts.length >= 1 && attempts.every((p) => p.status === 'failed'),
        'razorpay attempts: ' + attempts.map((p) => p.status).join(','));
      expect(await page.evaluate(() => [...document.querySelectorAll('[role=button]')]
        .some((e) => e.offsetParent !== null && e.textContent.trim().startsWith('Pay '))), 'Pay button gone after failure');
      return `razorpay: ${attempts.length} failed attempt(s); ours untouched`;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F2', 'bank Failure, retry in same checkout with Success → funded by the 2nd attempt', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Failure');
      await L.until(async () => /retry|try again/i.test(await frameText(frame)), { timeout: 30000, what: 'retry offered' });
      await frame.evaluate(() => {
        const r = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && /^(retry|try again)/i.test(e.textContent.trim()));
        r && r.click();
      });
      await L.sleep(2000);
      await authenticate(page, frame, CARDS.visaDomestic, 'Success');
      await screenText(page, /Payment authorised/);
      // Held, not taken, until the supplier marks it ready (D-103).
      expect(L.paymentRow(paymentId).status === 'AUTHORIZED', 'not held: ' + L.paymentRow(paymentId).status);
      await L.dispatch(orderId);
      await L.until(() => L.paymentRow(paymentId).status === 'CAPTURED', { timeout: 40000, what: 'capture' });
      const attempts = await rzpPaymentsFor(providerOrderId);
      const good = attempts.find((p) => p.status === 'captured');
      expect(attempts.some((p) => p.status === 'failed') && good, 'attempts: ' + attempts.map((p) => p.status).join(','));
      expect(L.paymentRow(paymentId).providerPaymentId === good.id, 'we recorded the wrong attempt');
      expect(L.orderStatus(orderId) === 'READY_FOR_PICKUP', 'order ' + L.orderStatus(orderId));
      markPaid(orderId, paymentId, providerOrderId);
      return `attempts ${attempts.map((p) => p.status).join(' → ')}`;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F3', 'close checkout without paying → review state, nothing at Razorpay', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await L.sleep(3000);
      await dismiss(page, frame);
      await screenText(page, /payment window was closed/i);
      expect(L.paymentRow(paymentId).status === 'CREATED', 'payment ' + L.paymentRow(paymentId).status);
      expect(L.orderStatus(orderId) === 'DRAFT', 'order ' + L.orderStatus(orderId));
      expect((await rzpPaymentsFor(providerOrderId)).length === 0, 'razorpay has a payment');
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F4', 'international card → refused by the account, or failed at the bank; never funded', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      const how = await submitCard(page, frame, CARDS.visaInternational);
      let outcome;
      if (how.popup || how.otp) {
        // The account accepts international cards: fail it at the bank instead.
        if (how.popup) await bank(how.popup, 'Failure');
        else await authenticate(page, frame, CARDS.visaInternational, 'Failure');
        outcome = 'accepted by the account; failed at the bank';
      } else {
        // Drop the animated price digits Razorpay renders as separate nodes.
        const text = (await frameText(frame)).replace(/\s+/g, ' ').replace(/(\d ){3,}/g, '');
        const said = text.match(/(payment could not be completed\.?\s*)?[^.]*(international|not supported|not enabled|not allowed|declined)[^.]*\.?/i)?.[0];
        expect(said, 'card was neither refused nor sent to the bank: ' + text.slice(-200));
        outcome = 'refused: ' + said.slice(Math.max(0, said.search(/payment could not/i))).trim().slice(0, 160);
      }
      await L.sleep(3000);
      await snapshot(page, 'F4-international');
      await dismiss(page, frame).catch(() => {});
      await L.sleep(2000);
      expect(L.paymentRow(paymentId).status === 'CREATED', 'payment ' + L.paymentRow(paymentId).status);
      expect(L.orderStatus(orderId) === 'DRAFT', 'order ' + L.orderStatus(orderId));
      const attempts = await rzpPaymentsFor(providerOrderId);
      expect(attempts.every((p) => !['authorized', 'captured'].includes(p.status)), 'razorpay holds money');
      return outcome;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F5', "confirm call lost after paying → app says 'still checking', sweep funds it", async () => {
    const { page, orderId, paymentId } = await openCheckout({ block: (u) => /\/payments\/\d+\/confirm/.test(u) });
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Success');
      await screenText(page, /still checking/i);
      await snapshot(page, 'F5-still-checking');
      expect(!/Payment failed/.test(await L.visibleText(page)), 'the app claimed failure');
      expect(L.paymentRow(paymentId).status === 'CREATED' && !L.paymentRow(paymentId).providerPaymentId,
        'server already knew — the confirm was not actually lost');
      // Stand in for two minutes passing, which is when the sweep considers a payment stale.
      L.db(`update payment set updated_at = date_sub(utc_timestamp(6), interval 10 minute) where id=${paymentId}`);
      await L.until(() => L.orderStatus(orderId) === 'CONFIRMED', { timeout: 150000, every: 3000, what: 'reconciliation by order id' });
      return 'recovered via GET /v1/orders/{id}/payments';
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F9', 'confirm call lost, signed webhook arrives → funded without waiting for the sweep', async () => {
    const { page, orderId, paymentId, providerOrderId } = await openCheckout({ block: (u) => /\/payments\/\d+\/confirm/.test(u) });
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Success');
      await screenText(page, /still checking/i);
      expect(L.paymentRow(paymentId).status === 'CREATED', 'server already knew');
      // What Razorpay would send: the real payment, signed with our webhook secret.
      const real = (await rzpPaymentsFor(providerOrderId)).find((p) => p.status === 'authorized' || p.status === 'captured');
      expect(real, 'no authorised payment at Razorpay');
      const body = JSON.stringify({ entity: 'event', account_id: 'acc_test', event: 'payment.authorized', contains: ['payment'],
        payload: { payment: { entity: real } }, created_at: Math.floor(Date.now() / 1000) });
      const r = await L.api('/webhooks/razorpay', { raw: body,
        headers: { 'X-Razorpay-Signature': L.signWebhook(body), 'X-Razorpay-Event-Id': 'evt_' + crypto.randomBytes(8).toString('hex') } });
      expect(r.status === 200, 'webhook ' + r.status);
      await L.until(() => L.orderStatus(orderId) === 'CONFIRMED', { timeout: 20000, what: 'order released by webhook' });
      return `${real.id} released by webhook`;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('F10', 'paid, then the supplier cancels before ready → hold released, nothing captured at Razorpay', async () => {
    const { page, orderId, paymentId } = await openCheckout();
    try {
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Success');
      await screenText(page, /Payment authorised/);
    } finally { await L.adoptSession(page); await page.close(); }
    const seller = (await L.session(L.SELLER)).accessToken;
    const r = await L.api(`/supplier-orders/${orderId}/supplier-cancel`, {
      body: { reason: 'OUT_OF_STOCK' }, token: seller, headers: { 'Idempotency-Key': crypto.randomUUID() } });
    expect(r.status === 200, 'cancel ' + r.status + ' ' + (r.error?.code || ''));
    expect(L.orderStatus(orderId) === 'CANCELLED', 'order ' + L.orderStatus(orderId));
    const row = L.paymentRow(paymentId);
    expect(row.status === 'RELEASED' && Number(row.captured) === 0, `payment ${row.status} captured ${row.captured}`);
    expect(L.db(`select count(*) from refund where payment_id=${paymentId}`) === '0', 'a refund was raised');
    // At Razorpay: authorised, never captured — the hold lapses back to the card.
    const at = await L.rzp(`/v1/payments/${row.providerPaymentId}`);
    expect(at.status === 'authorized' && !at.captured, `razorpay ${at.status} captured=${at.captured}`);
    return 'released; Razorpay still only authorised';
  }, { retries: 1 });

  await test('F6', "Razorpay's checkout script blocked → clear error, nothing charged", async () => {
    const { page, orderId, paymentId } = await openCheckout({ block: (u) => u.includes('checkout.razorpay.com') });
    try {
      await screenText(page, /could not be loaded/i);
      await snapshot(page, 'F6-script-blocked');
      expect(L.paymentRow(paymentId).status === 'CREATED', 'payment ' + L.paymentRow(paymentId).status);
      expect(L.orderStatus(orderId) === 'DRAFT', 'order ' + L.orderStatus(orderId));
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('D1', 'Create Order tapped twice at once → one order, pay screen, no error', async () => {
    const intentId = await L.acceptedRequest(1);
    const page = await L.signedInPage(b, `/restaurant/requests/${intentId}`);
    try {
      const errors = [];
      page.on('response', async (r) => {
        if (/\/intents\/\d+\/orders$/.test(r.url()) && r.request().method() === 'POST' && r.status() >= 400) {
          errors.push(r.status());
        }
      });
      await page.waitForFunction(() => [...document.querySelectorAll('[role=button]')]
        .some((e) => e.offsetParent !== null && e.textContent.trim().startsWith('Create Order')), { timeout: 20000 });
      // Two presses in the same tick — faster than any re-render can disable the button.
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('[role=button]')]
          .filter((e) => e.offsetParent !== null && e.textContent.trim().startsWith('Create Order')).pop();
        el.click(); el.click();
      });
      await page.waitForFunction(() => location.pathname.startsWith('/restaurant/pay/'), { timeout: 20000 });
      await L.sleep(2500);
      const orders = L.db(`select count(*) from intent_order_link where intent_id=${intentId}`);
      expect(orders === '1', 'orders for the request: ' + orders);
      expect(errors.length === 0, 'order calls refused: ' + errors.join(','));
      expect(!/already used|different request|could not create/i.test(await L.visibleText(page)), 'error shown to the restaurant');
      return 'one order, no refusal';
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('P1', 'pay from the order screen with nothing cached → Razorpay opens and the order is funded', async () => {
    // As after a refresh, a long bank flow, or coming back later: the pay screen
    // has no hand-over from the request screen and must ask the server (D-102).
    const o = await L.placedOrder(1);
    const page = await L.signedInPage(b, `/restaurant/orders/${o.orderId}`);
    try {
      await L.tap(page, 'Pay Now');
      await page.waitForFunction(() => location.pathname.startsWith('/restaurant/pay/'), { timeout: 20000 });
      await L.tap(page, 'Pay ');
      const frame = await checkoutFrame(page);
      await authenticate(page, frame, CARDS.visaDomestic, 'Success');
      await screenText(page, /Payment authorised/);
      // Held, not taken, until the supplier marks it ready (D-103).
      expect(L.paymentRow(o.paymentId).status === 'AUTHORIZED', 'not held: ' + L.paymentRow(o.paymentId).status);
      await L.dispatch(o.orderId);
      await L.until(() => L.paymentRow(o.paymentId).status === 'CAPTURED', { timeout: 40000, what: 'capture' });
      expect(L.orderStatus(o.orderId) === 'READY_FOR_PICKUP', 'order ' + L.orderStatus(o.orderId));
      expect(L.paymentRow(o.paymentId).providerPaymentId, 'no payment recorded');
      return 'paid via the order screen, same provider order ' + o.providerOrderId;
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 1 });

  await test('P2', 'a payment that has ended offers no Pay and no Try Again', async () => {
    const o = await L.placedOrder(1);
    // What the sweep does to an intent nobody completed within a day (D-101).
    L.db(`update payment set status='FAILED', failure_code='INTENT_EXPIRED' where id=${o.paymentId}`);
    const page = await L.signedInPage(b, `/restaurant/pay/${o.orderId}`);
    try {
      await screenText(page, /can.t be completed/i);
      const buttons = await page.evaluate(() => [...document.querySelectorAll('[role=button]')]
        .filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()));
      expect(!buttons.some((t) => t.startsWith('Pay ') || t === 'Try Again'),
        'still offered: ' + buttons.join(', '));
      return 'offered only: ' + buttons.join(', ');
    } finally { await L.adoptSession(page); await page.close(); }
  });

  // ── Server-side failure cases against Razorpay test mode ──

  const buyer = async () => (await L.session(L.BUYER)).accessToken;

  await test('S1', "confirm with another order's real Razorpay payment → 400, nothing changes", async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const o = await L.placedOrder(1);
    const r = await L.api(`/payments/${o.paymentId}/confirm`, { body: { providerPaymentId: paid.providerPaymentId }, token: await buyer() });
    expect(r.status === 400, `status ${r.status} ${r.error?.code}`);
    expect(L.paymentRow(o.paymentId).status === 'CREATED' && L.orderStatus(o.orderId) === 'DRAFT', 'state changed');
    return r.error?.message;
  });

  await test('S2', 'confirm with an id Razorpay does not know → 400, order still payable', async () => {
    const o = await L.placedOrder(1);
    const r = await L.api(`/payments/${o.paymentId}/confirm`, { body: { providerPaymentId: 'pay_DoesNotExist00' }, token: await buyer() });
    expect(r.status === 400, `status ${r.status} ${r.error?.code}`);
    expect(L.paymentRow(o.paymentId).status === 'CREATED', 'payment became ' + L.paymentRow(o.paymentId).status);
    return r.error?.message;
  });

  await test('S3', "another restaurant confirming this payment → 404 (not 403)", async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const stranger = (await L.session(L.STRANGER)).accessToken;
    const r = await L.api(`/payments/${paid.paymentId}/confirm`, { body: { providerPaymentId: paid.providerPaymentId }, token: stranger });
    expect(r.status === 404, `status ${r.status}`);
  });

  await test('S4', 'confirming an already-captured payment again changes nothing', async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const before = L.db(`select count(*) from payment_transaction where payment_id=${paid.paymentId}`);
    const r = await L.api(`/payments/${paid.paymentId}/confirm`, { body: { providerPaymentId: paid.providerPaymentId }, token: await buyer() });
    expect(r.status === 200 && r.data.status === 'CAPTURED', `status ${r.status} ${r.data?.status}`);
    expect(L.db(`select count(*) from payment_transaction where payment_id=${paid.paymentId}`) === before, 'new ledger rows');
  });

  await test('S5', 'mock simulation endpoint is refused on a real provider', async () => {
    const o = await L.placedOrder(1);
    const r = await L.api(`/internal/payments/${o.paymentId}/simulate-checkout`, { body: {}, token: await buyer() });
    expect(r.status === 403, `status ${r.status}`);
    expect(L.paymentRow(o.paymentId).status === 'CREATED', 'payment changed');
  });

  // Webhooks, signed with our real webhook secret, in Razorpay's real shape.
  const hook = (body, headers) => L.api('/webhooks/razorpay', { raw: body, headers });
  const hookBody = (event, payId, orderId) => JSON.stringify({
    entity: 'event', account_id: 'acc_test', event, contains: ['payment'],
    payload: { payment: { entity: { id: payId, order_id: orderId, entity: 'payment' } } },
    created_at: Math.floor(Date.now() / 1000),
  });

  await test('W1', 'webhook with a forged signature → 400, not stored', async () => {
    const id = 'evt_' + crypto.randomBytes(8).toString('hex');
    const r = await hook(hookBody('payment.captured', 'pay_x', 'order_x'), { 'X-Razorpay-Signature': 'deadbeef', 'X-Razorpay-Event-Id': id });
    expect(r.status === 400, 'status ' + r.status);
    expect(L.db(`select count(*) from payment_webhook_event where provider_event_id='${id}'`) === '0', 'stored');
  });

  await test('W2', 'webhook body tampered after signing → 400', async () => {
    const body = hookBody('payment.captured', 'pay_x', 'order_x');
    const r = await hook(body.replace('pay_x', 'pay_y'), { 'X-Razorpay-Signature': L.signWebhook(body), 'X-Razorpay-Event-Id': 'evt_t' + Date.now() });
    expect(r.status === 400, 'status ' + r.status);
  });

  await test('W3', 'valid webhook delivered twice → 200 both, stored once, no second transition', async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const id = 'evt_' + crypto.randomBytes(8).toString('hex');
    const body = hookBody('payment.captured', paid.providerPaymentId, paid.providerOrderId);
    const h = { 'X-Razorpay-Signature': L.signWebhook(body), 'X-Razorpay-Event-Id': id };
    const before = L.db(`select count(*) from payment_transaction where payment_id=${paid.paymentId}`);
    const codes = [(await hook(body, h)).status, (await hook(body, h)).status];
    expect(codes.join() === '200,200', 'codes ' + codes);
    expect(L.db(`select count(*) from payment_webhook_event where provider_event_id='${id}'`) === '1', 'not stored exactly once');
    expect(L.db(`select count(*) from payment_transaction where payment_id=${paid.paymentId}`) === before, 'ledger moved');
  });

  await test('W4', 'signed webhook with no event id anywhere → 400 malformed', async () => {
    const body = hookBody('payment.captured', 'pay_x', 'order_x');
    const r = await hook(body, { 'X-Razorpay-Signature': L.signWebhook(body) });
    expect(r.status === 400 && r.error?.code === 'MALFORMED_REQUEST', `status ${r.status} ${r.error?.code}`);
  });

  await test('W5', 'signed webhook for a payment we never created → 200, recorded as IGNORED', async () => {
    const id = 'evt_' + crypto.randomBytes(8).toString('hex');
    const body = hookBody('payment.authorized', 'pay_NotOurs0000001', 'order_NotOurs000001');
    const r = await hook(body, { 'X-Razorpay-Signature': L.signWebhook(body), 'X-Razorpay-Event-Id': id });
    expect(r.status === 200, 'status ' + r.status);
    expect(L.db(`select status from payment_webhook_event where provider_event_id='${id}'`) === 'IGNORED', 'not ignored');
  });

  // Refunds, against the captured payment from C1.
  const refund = async (amount, key, reason = 'CANCELLATION') => L.api(`/payments/${paid.paymentId}/refund`, {
    body: { amount, reason }, token: await buyer(), headers: key ? { 'Idempotency-Key': key } : {},
  });

  await test('R1', 'refund without an Idempotency-Key → refused', async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const r = await refund('1.00', null);
    expect(r.status === 400, `status ${r.status} ${r.error?.code}`);
  });

  await test('R2', 'refund with an unknown reason → 400', async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const r = await refund('1.00', crypto.randomUUID(), 'BECAUSE');
    expect(r.status === 400, `status ${r.status}`);
  });

  await test('R3', 'refund more than was captured → refused, nothing at Razorpay', async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const before = (await L.rzp(`/v1/payments/${paid.providerPaymentId}/refunds`)).count;
    const r = await refund((Number(paid.amount) + 100).toFixed(2), crypto.randomUUID());
    expect(r.status >= 400, `status ${r.status}`);
    expect((await L.rzp(`/v1/payments/${paid.providerPaymentId}/refunds`)).count === before, 'razorpay refunded');
    return `${r.status} ${r.error?.code}`;
  });

  await test('R4', 'partial refund, same key sent twice → one refund at Razorpay', async () => {
    expect(paid, 'needs a captured payment from C1, C2, C3 or F2');
    const key = crypto.randomUUID();
    const first = await refund('10.00', key);
    const second = await refund('10.00', key);
    expect(first.status === 200 && second.status === 200, `status ${first.status}/${second.status}`);
    expect(first.data.id === second.data.id, 'two refunds created');
    await L.until(() => ['COMPLETED', 'FAILED'].includes(
      L.db(`select status from refund where id=${first.data.id}`)),
    // Razorpay test mode answers "pending" at first; the job asks again two
    // minutes after the refund last changed (D-101), so allow for that.
    { timeout: 240000, every: 5000, what: 'refund job' });
    const status = L.db(`select status from refund where id=${first.data.id}`);
    const at = await L.rzp(`/v1/payments/${paid.providerPaymentId}/refunds`);
    expect(status === 'COMPLETED', 'refund ' + status);
    expect(at.count === 1 && at.items[0].amount === 1000, `razorpay refunds: ${at.count}`);
    return `refund ${at.items[0].id}, ₹10.00`;
  });

  await test('R5', 'refund on a payment never captured → refused', async () => {
    const o = await L.placedOrder(1);
    const r = await L.api(`/payments/${o.paymentId}/refund`, {
      body: { amount: '1.00', reason: 'CANCELLATION' }, token: await buyer(),
      headers: { 'Idempotency-Key': crypto.randomUUID() } });
    expect(r.status === 409 || r.status === 422, `status ${r.status} ${r.error?.code}`);
    return `${r.status} ${r.error?.code}`;
  });

  await b.close();

  // ── report ──
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  fs.writeFileSync(`${__dirname}/report.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); if (b) await b.close(); process.exit(2); });
