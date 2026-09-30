/* global __dirname, window */
// Razorpay TEST-mode UPI campaign for the local stack. OBSERVE ONLY: it drives
// the real web app and Razorpay's real checkout, and records what our code does
// (DB rows, API log lines, Razorpay's own record) against what it should do.
//
// How UPI is exercised in test mode (see the research notes):
//  - UPI intent succeeds by itself: Standard Checkout with a MOBILE user agent
//    shows the UPI app sheet, and tapping Pay authorises (or captures, on an
//    auto-capture order) with vpa success@razorpay. A desktop user agent shows
//    only the UPI QR tab, which nobody can pay in test mode.
//  - UPI failure can only be made by the Collect call razorpay.js itself makes
//    (POST /v1/payments/create/ajax with the public key id and
//    vpa=failure@razorpay) against the order our API created.
//  - "Pay the same order again" is done in a real checkout window opened on an
//    order we already own (a tiny page served by request interception).
//
// Usage: node upi-suite.js [filter]      e.g.  node upi-suite.js T   |   node upi-suite.js L1
// Needs a running local stack in Razorpay TEST mode, like suite.js. Writes
// shots/upi-report[-filter].json (gitignored) with every check, row and log line.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { KnownDevices } = require('puppeteer-core');
const L = require('./lib');

const only = process.argv[2];
const results = [];
let b;

const API_LOG = process.env.API_LOG || `${process.env.HOME}/.local/var/logs/api.log`;
const REPORT = process.env.UPI_REPORT
  || `${__dirname}/shots/upi-report${only ? '-' + only.replace(/[^A-Za-z0-9]+/g, '_') : ''}.json`;
const PHONE = '9876500004';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/130.0.0.0 Safari/537.36';
const HARNESS = 'http://127.0.0.1:8765/pay';

// The signing secret is read the way lib.js reads it and only ever used to sign;
// it is never printed. Signing stands in for the handler's proof where a case
// has to hand our confirm call a payment made outside the app's own screen.
const API_REPO = process.env.API_REPO || path.resolve(__dirname, '../../../costonomy-mp-api');
const SECRET = (fs.readFileSync(`${API_REPO}/src/main/resources/application-local.properties`, 'utf8')
  .split('\n').find((l) => l.startsWith('costonomy.mp.razorpay.key-secret=')) || '').split('=').slice(1).join('=').trim();
const sign = (orderId, paymentId) => crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

// ── recording ─────────────────────────────────────────────────────────

const sleep = L.sleep;
const now = () => new Date().toISOString().slice(11, 23);

/**
 * A case collects checks (never thrown, so one wrong answer does not hide the
 * rest of what happened), notes, DB rows and the log lines that prove the sequence.
 */
function makeCtx(id) {
  const ctx = { id, checks: [], notes: {}, rows: {}, logs: [], timings: {} };
  ctx.check = (what, ok, observed) => {
    ctx.checks.push({ what, ok: !!ok, observed: observed === undefined ? '' : String(observed) });
    return !!ok;
  };
  ctx.note = (k, v) => { ctx.notes[k] = v; };
  ctx.row = (k, v) => { ctx.rows[k] = v; };
  ctx.log = (mark, terms) => { ctx.logs.push(...logSince(mark, terms)); };
  return ctx;
}

async function test(id, name, expected, fn, { retries = 1 } = {}) {
  if (only && !only.split(',').some((prefix) => id.startsWith(prefix))) return;
  const started = Date.now();
  process.stdout.write(`${id}  ${name} ... `);
  const errors = [];
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctx = makeCtx(id);
    try {
      await fn(ctx);
      const failed = ctx.checks.filter((c) => !c.ok);
      const verdict = failed.length ? 'FAIL' : 'PASS';
      results.push({ id, name, expected, verdict, retried: errors.length, retryReason: errors[0], ...ctx,
        secs: Math.round((Date.now() - started) / 1000) });
      console.log(verdict + (errors.length ? ` [after ${errors.length} retry: ${errors[0].slice(0, 100)}]` : '')
        + failed.map((c) => `\n    x ${c.what}: ${c.observed}`).join(''));
      return;
    } catch (e) {
      errors.push(e.message);
      ctx.notes.error = e.message;
      if (attempt === retries) {
        results.push({ id, name, expected, verdict: 'ERROR', detail: errors.join(' || '), ...ctx,
          secs: Math.round((Date.now() - started) / 1000) });
        console.log('ERROR  ' + errors.join(' || '));
      }
    }
  }
}

// One line per Razorpay call is logged by the API (D-100), and the wallet and
// payment services log every state change; these are the ones that prove a case.
const logMark = () => { try { return fs.statSync(API_LOG).size; } catch { return 0; } };
function logSince(mark, terms) {
  let text;
  try {
    const fd = fs.openSync(API_LOG, 'r');
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.max(0, size - mark));
    fs.readSync(fd, buf, 0, buf.length, mark);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return []; }
  const wanted = terms.filter(Boolean).map((t) => (t instanceof RegExp ? t : new RegExp(String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  const out = [];
  for (const line of text.split('\n')) {
    if (!/^\d{4}-\d\d-\d\dT/.test(line) || !wanted.some((w) => w.test(line))) continue;
    const m = line.match(/^\S+T(\S+)\s+(\w+)\s+\[[^\]]*\]\s+(.*?)\s+\d+ --- \[[^\]]*\] \[[^\]]*\]\s+(\S+)\s+:\s(.*)$/);
    if (!m) { out.push(line.slice(0, 260)); continue; }
    const tags = (m[3].match(/(payment|order|rzp_order|rzp_payment|wallet_top_up)=\S+/g) || []).join(' ');
    out.push(`${m[1]} ${m[2]} ${m[4].split('.').pop()} ${tags ? '{' + tags + '} ' : ''}${m[5]}`.slice(0, 420));
  }
  return out;
}

const cols = (sql, names) => {
  const out = L.db(sql);
  if (!out) return null;
  const v = out.split('\n')[0].split('\t');
  return Object.fromEntries(names.map((n, i) => [n, v[i]]));
};
const rowsOf = (sql, names) => {
  const out = L.db(sql);
  return out ? out.split('\n').map((r) => Object.fromEntries(r.split('\t').map((v, i) => [names[i], v]))) : [];
};
const TOP_UP_COLS = ['id', 'status', 'amount', 'razorpay_order_id', 'razorpay_payment_id', 'payment_method',
  'payment_detail', 'provider_refund_id', 'refund_attempts', 'failure_reason', 'credited_at', 'checked_at', 'created_at'];
const topUp = (id) => cols(`select ${TOP_UP_COLS.join(',')} from wallet_top_up where id=${id}`, TOP_UP_COLS);
const ledgerOf = (id) => rowsOf(`select id,direction,kind,reference,amount,balance_after,created_at from wallet_transaction where reference='topup-${id}'`,
  ['id', 'direction', 'kind', 'reference', 'amount', 'balance_after', 'created_at']);
const PAY_COLS = ['id', 'supplier_order_id', 'status', 'provider_payment_id', 'provider_order_id', 'payment_method',
  'authorized_amount', 'captured_amount', 'refunded_amount', 'released_amount', 'failure_code', 'authorized_at',
  'captured_at', 'released_at', 'reconciled_at', 'updated_at'];
const payment = (id) => cols(`select ${PAY_COLS.join(',')} from payment where id=${id}`, PAY_COLS);
const paymentTx = (id) => rowsOf(`select id,transaction_type,amount,status,provider_reference,failure_code,created_at from payment_transaction where payment_id=${id} order by id`,
  ['id', 'transaction_type', 'amount', 'status', 'provider_reference', 'failure_code', 'created_at']);
const refundsOf = (id) => rowsOf(`select id,amount,reason,destination,status,attempts,provider_refund_id,failure_code,failure_reason from refund where payment_id=${id} order by id`,
  ['id', 'amount', 'reason', 'destination', 'status', 'attempts', 'provider_refund_id', 'failure_code', 'failure_reason']);
const walletTxOfOrder = (orderId) => rowsOf(`select id,direction,kind,reference,amount,balance_after from wallet_transaction where supplier_order_id=${orderId} order by id`,
  ['id', 'direction', 'kind', 'reference', 'amount', 'balance_after']);
const orderRow = (id) => cols(`select id,status,payment_status,total_amount,cancellation_reason from supplier_order where id=${id}`,
  ['id', 'status', 'payment_status', 'total_amount', 'cancellation_reason']);
const balance = () => Number(L.db('select balance from wallet where outlet_id=1'));
const ledgerSum = () => Number(L.db("select coalesce(sum(case direction when 'CREDIT' then amount else -amount end),0) from wallet_transaction where wallet_id=1"));
const utc = (s) => (s && s !== 'NULL' ? Date.parse(s.replace(' ', 'T') + 'Z') : NaN);
const near = (a, b2) => Math.abs(a - b2) < 0.005;

const buyerToken = async () => (await L.session(L.BUYER)).accessToken;
const sellerToken = async () => (await L.session(L.SELLER)).accessToken;
const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() });

// ── Razorpay, directly ────────────────────────────────────────────────

const rzpOrderPayments = async (orderId) => (await L.rzp(`/v1/orders/${orderId}/payments`)).items || [];
const brief = (p) => `${p.id} ${p.status} ${p.method}${p.vpa ? ' ' + p.vpa : ''}${p.upi?.flow ? ' flow=' + p.upi.flow : ''}`
  + ` captured=${p.captured} refunded=${p.amount_refunded ?? 0}${p.error_code ? ' err=' + p.error_code : ''}`;

/** What razorpay.js itself posts (public key only). Returns Razorpay's answer. */
async function createAjax(razorpayOrderId, paise, fields) {
  const form = new URLSearchParams({ order_id: razorpayOrderId, amount: String(paise), currency: 'INR',
    contact: PHONE, email: 'payer@example.com', ...fields });
  const res = await fetch(`https://api.razorpay.com/v1/payments/create/ajax?key_id=${L.KEY_ID}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, error: json.error?.description };
}
const upiFailure = (orderId, paise) => createAjax(orderId, paise,
  { method: 'upi', 'upi[flow]': 'collect', vpa: 'failure@razorpay' });
const upiIntent = (orderId, paise) => createAjax(orderId, paise, { method: 'upi', 'upi[flow]': 'intent' });
const cardAttempt = (orderId, paise) => createAjax(orderId, paise, { method: 'card',
  'card[number]': '4100280000001007', 'card[expiry_month]': '12', 'card[expiry_year]': '30', 'card[cvv]': '123',
  'card[name]': 'Test Payer' });

/** Wait for Razorpay to hold a payment on this order in one of these states. */
const rzpPaymentIn = (orderId, states, timeout = 30000) => L.until(async () => {
  const p = (await rzpOrderPayments(orderId)).find((x) => states.includes(x.status));
  return p || null;
}, { timeout, every: 350, what: `razorpay payment ${states.join('/')} on ${orderId}` });

// ── browser ───────────────────────────────────────────────────────────

/** A signed-in incognito page, phone-sized with a Pixel 5 user agent or a desktop one. */
async function openPage(pathname, { mobile, phone = L.BUYER } = {}) {
  const s = await L.session(phone);
  const context = await b.createBrowserContext();
  const page = await context.newPage();
  if (mobile) {
    await page.emulate(KnownDevices['Pixel 5']);
  } else {
    await page.setUserAgent(DESKTOP_UA);
    await page.setViewport({ width: 1280, height: 800 });
  }
  page.on('dialog', (d) => d.accept());
  await page.goto(L.WEB + '/welcome', { waitUntil: 'networkidle2' });
  await page.evaluate((a, r) => { localStorage.setItem('mp.accessToken', a); localStorage.setItem('mp.refreshToken', r); },
    s.accessToken, s.refreshToken);
  await page.goto(L.WEB + pathname, { waitUntil: 'networkidle2' });
  return page;
}

const checkoutFrame = (page) => L.until(
  () => page.frames().find((f) => f.url().includes('api.razorpay.com/v1/checkout')),
  { timeout: 30000, what: "Razorpay's checkout" });
const frameText = (frame) => frame.evaluate(() => document.body.innerText).catch(() => '');
const flat = (t) => (t || '').replace(/\s+/g, ' ').trim();

async function snapshot(page, name) {
  fs.mkdirSync(`${__dirname}/shots`, { recursive: true });
  await page.screenshot({ path: `${__dirname}/shots/upi-${name}.png` }).catch(() => {});
}

async function contactStep(frame) {
  const asked = await frame.waitForSelector('input[name=contact]', { visible: true, timeout: 8000 })
    .then(() => true).catch(() => false);
  if (asked) {
    await L.ftype(frame, 'input[name=contact]', PHONE);
    // On a phone Continue is tapped; on desktop the field submits itself ("Using as +91 ...").
    await L.until(() => frame.evaluate(() => {
      if (/Using as/.test(document.body.innerText)) return true;
      const el = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && e.textContent.trim() === 'Continue');
      if (!el) return false; el.click(); return true;
    }).catch(() => false), { timeout: 15000, every: 400, what: 'the contact step to finish' });
  }
}

/**
 * Standard Checkout on a phone: contact, then the UPI app sheet, Google Pay,
 * Continue. In test mode the payment is made the moment it is created.
 * Resolves with the time the tap on the last button was made.
 */
async function payUpiIntent(frame) {
  await contactStep(frame);
  await L.fclick(frame, '[data-testid=google_pay]', { timeout: 25000 }).catch(async (e) => {
    throw new Error(e.message + '; checkout showed: ' + flat(await frameText(frame)).slice(-300));
  });
  await sleep(800);
  await L.fclick(frame, '[data-testid=bottom-cta-button]');
  return Date.now();
}

/** Same page, desktop user agent: contact, and then whatever UPI shows. */
async function desktopUpiView(frame) {
  await contactStep(frame);
  await sleep(4000);
  return flat(await frameText(frame));
}

async function dismiss(frame) {
  for (let i = 0; i < 6; i++) {
    const confirmed = await frame.evaluate(() => {
      const yes = document.querySelector('[data-testid=confirm-positive]');
      if (yes && yes.offsetParent !== null) { yes.click(); return true; }
      return false;
    }).catch(() => false);
    if (confirmed) return;
    // A phone has a back arrow; the desktop window has a close cross.
    await L.fclick(frame, '[data-testid=nav-back], [data-testid=checkout-close]', { timeout: 15000 }).catch(() => {});
    await sleep(1500);
  }
  throw new Error("could not close Razorpay's window");
}

/** Watches a page for the app's own confirm calls, and can hold them back to make a "lost confirm". */
async function watchConfirms(page, pattern, { block = false } = {}) {
  const seen = [];
  if (block) await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (pattern.test(r.url()) && r.method() === 'POST') {
      let body = null;
      try { body = JSON.parse(r.postData() || '{}'); } catch { /* not JSON */ }
      seen.push({ at: now(), body, blocked: block });
      if (block) { r.abort(); return; }
    }
    if (block) r.continue();
  });
  return seen;
}

/** Add money on the wallet screen: type the amount and tap the button. Returns the top-up row id. */
async function startTopUp(page, amount) {
  await L.typeInto(page, '0', String(amount));
  await L.tap(page, 'Add ');
  const id = await L.until(() => {
    const v = L.db(`select id from wallet_top_up where outlet_id=1 and amount=${amount} and status='CREATED' and razorpay_order_id is not null order by id desc limit 1`);
    return v ? Number(v) : null;
  }, { timeout: 20000, every: 300, what: `top-up row for ${amount}` });
  return id;
}

/** A checkout window on an order we already hold, in a page of its own (for paying it again). */
async function harnessCheckout(razorpayOrderId, { mobile = true } = {}) {
  const context = await b.createBrowserContext();
  const page = await context.newPage();
  if (mobile) await page.emulate(KnownDevices['Pixel 5']);
  await page.setRequestInterception(true);
  const html = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script><body>harness</body>
    <script>
      window.__proof = null; window.__dismissed = false;
      window.__open = function () {
        var r = new Razorpay({ key: ${JSON.stringify(L.KEY_ID)}, order_id: ${JSON.stringify(razorpayOrderId)}, name: 'Mandi',
          handler: function (x) { window.__proof = x; },
          modal: { ondismiss: function () { window.__dismissed = true; }, confirm_close: true } });
        r.open();
      };
    </script>`;
  page.on('request', (r) => (r.url().startsWith(HARNESS)
    ? r.respond({ status: 200, contentType: 'text/html', body: html }) : r.continue()));
  await page.goto(HARNESS, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.Razorpay === 'function', { timeout: 20000 });
  await page.evaluate(() => window.__open());
  return { page, frame: await checkoutFrame(page), proof: () => page.evaluate(() => window.__proof) };
}

// ── shared steps ──────────────────────────────────────────────────────

/** An API-made top-up: the row and the Razorpay order, no browser. */
async function apiTopUp(amount) {
  const r = await L.api('/outlets/1/wallet/top-ups', { body: { amount: String(amount) }, token: await buyerToken(), headers: idem() });
  if (r.status !== 200) throw new Error('top-up create ' + r.status + ' ' + JSON.stringify(r.error));
  return { id: Number(r.data.topUpId), order: r.data.razorpayOrderId, paise: Math.round(Number(r.data.amount) * 100) };
}
async function confirmTopUpApi(t, proof, token) {
  return L.api(`/outlets/1/wallet/top-ups/${t.id}/confirm`, {
    body: { razorpayPaymentId: proof.paymentId, razorpaySignature: proof.signature }, token: token || await buyerToken() });
}
const topUpTerms = (t) => [new RegExp(`[Tt]op-up ${t.id}\\b`), t.order, `wallet_top_up=${t.id}`];

/** A mobile pay screen for a fresh order: request, Create Order, tap Pay. */
async function openOrderCheckout({ mobile = true, block = false } = {}) {
  const intentId = await L.acceptedRequest(1);
  const page = await openPage(`/restaurant/requests/${intentId}`, { mobile });
  const confirms = await watchConfirms(page, /\/payments\/\d+\/confirm/, { block });
  await L.tap(page, 'Create Order');
  await page.waitForFunction(() => location.pathname.startsWith('/restaurant/pay/'), { timeout: 20000 });
  const orderId = Number(await page.evaluate(() => location.pathname.split('/').pop()));
  const paymentId = L.paymentIdForOrder(orderId);
  await L.tap(page, 'Pay ');
  const providerOrderId = L.db(`select provider_order_id from payment where id=${paymentId}`);
  return { page, orderId, paymentId, providerOrderId, confirms };
}
const orderTerms = (o) => [o.providerOrderId, new RegExp(`\\b[Pp]ayment=${o.paymentId}\\b`),
  new RegExp(`\\b[Pp]ayment ${o.paymentId}\\b`), new RegExp(`order=${o.orderId}\\b`)];

/** Pay an order by UPI intent on a phone and wait until our server holds the money. */
async function payOrderByUpi(ctx, o, { state = 'AUTHORIZED' } = {}) {
  const frame = await checkoutFrame(o.page);
  const tapped = await payUpiIntent(frame);
  await L.until(() => ['AUTHORIZED', 'CAPTURED'].includes(payment(o.paymentId).status),
    { timeout: 90000, every: 1000, what: 'payment held by our server' });
  ctx.timings.tapToHeldSecs = Math.round((Date.now() - tapped) / 100) / 10;
  return tapped;
}

// ── the campaign ──────────────────────────────────────────────────────

let orderCase = null;   // the captured UPI order from O1, reused by O3

(async () => {
  fs.mkdirSync(`${__dirname}/shots`, { recursive: true });
  b = await L.browser();
  const started = new Date().toISOString();

  // ── L1: desktop QR left open until it expires (start this one first, in the background) ──

  await test('L1', 'desktop UPI QR left open until it expires', 'app stays consistent; row stays CREATED; nothing credited', async (ctx) => {
    const mark = logMark();
    const before = balance();
    const page = await openPage('/restaurant/wallet/add-money', { mobile: false });
    const t0 = Date.now();
    try {
      const id = await startTopUp(page, 131);
      const t = { id, order: topUp(id).razorpay_order_id };
      const frame = await checkoutFrame(page);
      const view = await desktopUpiView(frame);
      ctx.note('checkoutAtOpen', view.slice(0, 300));
      ctx.check('desktop shows the UPI QR tab', /UPI QR/i.test(view), view.slice(0, 200));
      await snapshot(page, 'L1-open');
      const timeline = [];
      let last = '';
      const until = Date.now() + Number(process.env.L1_MINUTES || 14) * 60000;
      while (Date.now() < until) {
        const app = flat(await page.evaluate(() => document.body.innerText).catch(() => ''));
        const cf = page.frames().find((f) => f.url().includes('api.razorpay.com/v1/checkout'));
        const rz = cf ? flat(await frameText(cf)) : '(checkout window gone)';
        const state = `APP: ${app.slice(0, 160)} || CHECKOUT: ${rz.slice(0, 200)}`.replace(/\d\d:\d\d/g, 'mm:ss');
        if (state !== last) {
          timeline.push({ at: `+${Math.round((Date.now() - t0) / 1000)}s`, app: app.slice(0, 200), checkout: rz.slice(0, 200) });
          last = state;
        }
        await sleep(15000);
      }
      ctx.note('timeline', timeline);
      await snapshot(page, 'L1-end');
      const row = topUp(id);
      ctx.row('wallet_top_up', row);
      ctx.check('top-up still CREATED after the QR expiry', row.status === 'CREATED', row.status);
      ctx.check('nothing credited', near(balance(), before), `balance ${before} -> ${balance()}`);
      const attempts = await rzpOrderPayments(t.order);
      ctx.note('razorpayPayments', attempts.map(brief));
      ctx.check('Razorpay has no payment on the order', attempts.length === 0, attempts.map(brief).join('; '));
      const o = await L.rzp(`/v1/orders/${t.order}`);
      ctx.note('razorpayOrder', `status=${o.status} attempts=${o.attempts} amount_paid=${o.amount_paid}`);
      ctx.check('the app never said the payment failed', !/payment failed|didn.t go through/i.test(last),
        last.slice(0, 200));
      ctx.log(mark, topUpTerms(t));
      ctx.timings.minutesOpen = Math.round((Date.now() - t0) / 6000) / 10;
    } finally { await page.close(); }
  }, { retries: 0 });

  // ── TOP-UPS ──

  await test('T1', 'UPI intent success on a mobile user agent', 'credit once; upi recorded; ledger TOP_UP; History says UPI', async (ctx) => {
    const amount = 121;
    const mark = logMark();
    const before = balance();
    const page = await openPage('/restaurant/wallet/add-money', { mobile: true });
    const confirms = await watchConfirms(page, /\/wallet\/top-ups\/\d+\/confirm/);
    try {
      const id = await startTopUp(page, amount);
      const frame = await checkoutFrame(page);
      const tapped = await payUpiIntent(frame);
      await L.until(() => topUp(id).status === 'CREDITED', { timeout: 60000, every: 500, what: 'credit' });
      ctx.timings.tapToCreditedSecs = Math.round((Date.now() - tapped) / 100) / 10;
      await L.until(async () => !/Add money/.test(flat(await page.evaluate(() => document.body.innerText))), { timeout: 20000, what: 'leave the screen' })
        .catch(() => {});
      ctx.note('appAfter', flat(await page.evaluate(() => document.body.innerText)).slice(0, 250));
      await snapshot(page, 'T1-after');
      const row = topUp(id);
      ctx.row('wallet_top_up', row);
      ctx.check('balance rose by exactly the amount, once', near(balance() - before, amount), `${before} -> ${balance()}`);
      ctx.check('status CREDITED', row.status === 'CREDITED', row.status);
      ctx.check('payment_method stored as upi', row.payment_method === 'upi', `payment_method=${row.payment_method} payment_detail=${row.payment_detail}`);
      const led = ledgerOf(id);
      ctx.row('wallet_transaction', led);
      ctx.check('one TOP_UP ledger row for the amount', led.length === 1 && led[0].kind === 'TOP_UP' && near(Number(led[0].amount), amount), JSON.stringify(led));
      ctx.check('sum(ledger) == balance', near(ledgerSum(), balance()), `${ledgerSum()} vs ${balance()}`);
      const rp = (await rzpOrderPayments(row.razorpay_order_id))[0];
      ctx.note('razorpay', rp && brief(rp));
      ctx.check('Razorpay: upi, captured, success@razorpay', rp && rp.method === 'upi' && rp.status === 'captured' && rp.vpa === 'success@razorpay', rp && brief(rp));
      ctx.check('the app called confirm once', confirms.length === 1, `${confirms.length} confirm call(s)`);
      const hist = await L.api('/outlets/1/wallet/transactions?size=10', { token: await buyerToken() });
      const item = (hist.data?.items || []).find((i) => i.kind === 'TOP_UP' && near(Number(i.amount), amount));
      ctx.note('historyItem', item && JSON.stringify({ kind: item.kind, amount: item.amount, instrument: item.instrument, status: item.status }));
      ctx.check('History API instrument is UPI', item && item.instrument === 'UPI', item && item.instrument);
      const hp = await openPage('/restaurant/wallet/history', { mobile: true });
      try {
        await sleep(2500);
        const text = flat(await hp.evaluate(() => document.body.innerText));
        ctx.note('historyScreen', text.slice(0, 300));
        ctx.check('History screen shows UPI on the top-up', /UPI/.test(text), text.slice(0, 200));
      } finally { await L.adoptSession(hp); await hp.close(); }
      ctx.log(mark, topUpTerms({ id, order: row.razorpay_order_id }));
    } finally { await L.adoptSession(page); await page.close(); }
  });

  await test('T2', 'desktop user agent: QR tab, checkout closed', 'QR shown; no credit; CREATED; UI not "failed"; poller quiet', async (ctx) => {
    const amount = 142;
    const mark = logMark();
    const before = balance();
    const page = await openPage('/restaurant/wallet/add-money', { mobile: false });
    try {
      const id = await startTopUp(page, amount);
      const t = { id, order: topUp(id).razorpay_order_id };
      const frame = await checkoutFrame(page);
      const view = await desktopUpiView(frame);
      ctx.note('desktopCheckout', view.slice(0, 300));
      ctx.check('QR tab shown', /UPI QR/i.test(view), view.slice(0, 160));
      ctx.check('no UPI app list on desktop', !/Google Pay/.test(view), '');
      await snapshot(page, 'T2-qr');
      await dismiss(frame);
      await sleep(2500);
      const text = flat(await page.evaluate(() => document.body.innerText));
      ctx.note('appAfterClose', text.slice(0, 300));
      await snapshot(page, 'T2-closed');
      ctx.check('the app does not say failed', !/fail|went wrong|error/i.test(text.replace(/Add money/i, '')), text.slice(0, 200));
      ctx.check('top-up stays CREATED, nothing credited', topUp(id).status === 'CREATED' && near(balance(), before),
        `${topUp(id).status}, balance ${before} -> ${balance()}`);
      // What the poller does with it over the next three minutes.
      const samples = [];
      const end = Date.now() + 180000;
      while (Date.now() < end) {
        await sleep(20000);
        const r = topUp(id);
        samples.push(`${now()} status=${r.status} checked_at=${r.checked_at}`);
      }
      ctx.note('pollerSamples', samples);
      const row = topUp(id);
      ctx.row('wallet_top_up', row);
      ctx.check('poller ran (checked_at set)', row.checked_at && row.checked_at !== 'NULL', row.checked_at);
      ctx.check('still CREATED, no credit after 3 minutes', row.status === 'CREATED' && near(balance(), before), `${row.status}, ${balance()}`);
      ctx.check('no ledger row', ledgerOf(id).length === 0, '');
      ctx.log(mark, topUpTerms(t));
    } finally { await L.adoptSession(page); await page.close(); }
  }, { retries: 0 });

  await test('T3', 'paid by UPI intent, page killed before our confirm', 'poller credits within ~90 s, exactly once', async (ctx) => {
    const amount = 143;
    const mark = logMark();
    const before = balance();
    const page = await openPage('/restaurant/wallet/add-money', { mobile: true });
    // Guard: whatever the page does after it is killed must not reach our API.
    const confirms = await watchConfirms(page, /\/wallet\/top-ups\/\d+\/confirm/, { block: true });
    const id = await startTopUp(page, amount);
    const t = { id, order: topUp(id).razorpay_order_id };
    const createdAt = utc(topUp(id).created_at);
    const frame = await checkoutFrame(page);
    const tapped = await payUpiIntent(frame);
    const p = await rzpPaymentIn(t.order, ['captured', 'authorized'], 30000);
    const paidSeen = Date.now();
    await page.close();
    ctx.timings.tapToRazorpayPaidSecs = Math.round((paidSeen - tapped) / 100) / 10;
    ctx.note('razorpayPayment', brief(p));
    ctx.check('the page was gone before any confirm could reach us', confirms.length === 0, `${confirms.length} attempt(s), all blocked`);
    ctx.check('not credited yet right after the kill', topUp(id).status === 'CREATED', topUp(id).status);
    await L.until(() => topUp(id).status === 'CREDITED', { timeout: 200000, every: 2000, what: 'poller credit' });
    const row = topUp(id);
    ctx.timings.killToCreditedSecs = Math.round((utc(row.credited_at) - paidSeen) / 100) / 10;
    ctx.timings.topUpCreatedToCreditedSecs = Math.round((utc(row.credited_at) - createdAt) / 100) / 10;
    await sleep(70000);
    ctx.row('wallet_top_up', topUp(id));
    ctx.row('wallet_transaction', ledgerOf(id));
    ctx.check('credited by the poller', topUp(id).status === 'CREDITED', topUp(id).status);
    ctx.check('credited within ~90 s of the payment', ctx.timings.killToCreditedSecs <= 95, `${ctx.timings.killToCreditedSecs}s`);
    ctx.check('exactly once (balance and ledger, after a further poll cycle)', near(balance() - before, amount) && ledgerOf(id).length === 1,
      `balance ${before} -> ${balance()}, ${ledgerOf(id).length} ledger row(s)`);
    ctx.check('payment_method upi', topUp(id).payment_method === 'upi', topUp(id).payment_method);
    ctx.log(mark, topUpTerms(t));
  });

  await test('T4', 'duplicate confirms: 5 at once, then again, plus the poller', 'exactly one credit', async (ctx) => {
    const amount = 144;
    const mark = logMark();
    const before = balance();
    const page = await openPage('/restaurant/wallet/add-money', { mobile: true });
    const confirms = await watchConfirms(page, /\/wallet\/top-ups\/\d+\/confirm/, { block: true });
    try {
      const id = await startTopUp(page, amount);
      const t = { id, order: topUp(id).razorpay_order_id };
      const frame = await checkoutFrame(page);
      await payUpiIntent(frame);
      await L.until(() => confirms.length > 0, { timeout: 40000, every: 200, what: "the app's own confirm (held back by us)" });
      const proof = { paymentId: confirms[0].body.razorpayPaymentId, signature: confirms[0].body.razorpaySignature };
      ctx.check('the handler gave a payment id and signature', proof.paymentId && proof.signature, JSON.stringify({ paymentId: proof.paymentId, signature: proof.signature ? '(present)' : null }));
      const token = await buyerToken();
      const burst = await Promise.all([1, 2, 3, 4, 5].map(() => confirmTopUpApi(t, proof, token)));
      ctx.note('concurrentAnswers', burst.map((r) => `${r.status}${r.error ? ' ' + r.error.code : ''}`));
      const again = await confirmTopUpApi(t, proof, token);
      ctx.note('sequentialRepeat', `${again.status}${again.error ? ' ' + again.error.code : ''}`);
      ctx.check('every concurrent confirm answered 200 (or 409 processing), none 5xx', burst.every((r) => r.status === 200 || r.status === 409), burst.map((r) => r.status).join(','));
      ctx.check('a later repeat answers 200', again.status === 200, again.status);
      ctx.check('balance rose exactly once', near(balance() - before, amount), `${before} -> ${balance()}`);
      ctx.check('one ledger row', ledgerOf(id).length === 1, `${ledgerOf(id).length}`);
      await sleep(75000);   // the poller runs meanwhile
      ctx.check('still exactly once after the poller ran', near(balance() - before, amount) && ledgerOf(id).length === 1, `${balance() - before}, ${ledgerOf(id).length} rows`);
      ctx.row('wallet_top_up', topUp(id));
      ctx.row('wallet_transaction', ledgerOf(id));
      ctx.check('sum(ledger) == balance', near(ledgerSum(), balance()), `${ledgerSum()} vs ${balance()}`);
      ctx.log(mark, topUpTerms(t));
    } finally { await L.adoptSession(page); await page.close(); }
  });

  await test('T5', 'UPI failure (collect failure@razorpay), then the same top-up paid by intent', 'no credit on failure; one credit after success', async (ctx) => {
    const amount = 145;
    const mark = logMark();
    const before = balance();
    const t = await apiTopUp(amount);
    const fail = await upiFailure(t.order, t.paise);
    ctx.note('createAjax', `${fail.status} ${fail.json.type || fail.error || ''}`);
    const failed = await rzpPaymentIn(t.order, ['failed'], 30000);
    ctx.note('razorpayFailedPayment', brief(failed));
    ctx.check('Razorpay: the UPI payment failed', failed.status === 'failed' && failed.method === 'upi', brief(failed));
    const token = await buyerToken();
    const bogus = await L.api(`/outlets/1/wallet/top-ups/${t.id}/confirm`, { body: { razorpayPaymentId: failed.id, razorpaySignature: 'deadbeef' }, token });
    ctx.note('confirmWithFailedIdBadSignature', `${bogus.status} ${bogus.error?.code} ${bogus.error?.message}`);
    ctx.check('a bad signature is refused (4xx)', bogus.status >= 400 && bogus.status < 500, `${bogus.status} ${bogus.error?.code}`);
    const signed = await L.api(`/outlets/1/wallet/top-ups/${t.id}/confirm`, { body: { razorpayPaymentId: failed.id, razorpaySignature: sign(t.order, failed.id) }, token });
    ctx.note('confirmWithFailedIdSyntheticSignature', `${signed.status} ${signed.error?.code} ${signed.error?.message}`);
    ctx.check('a correctly signed id of a FAILED payment answers PAYMENT_FAILED, no credit', signed.status >= 400 && near(balance(), before),
      `${signed.status} ${signed.error?.code}; balance ${before} -> ${balance()}`);
    ctx.check('top-up stays CREATED', topUp(t.id).status === 'CREATED', topUp(t.id).status);
    await sleep(75000);
    ctx.check('the poller does not credit or end it', topUp(t.id).status === 'CREATED' && near(balance(), before), `${topUp(t.id).status}; checked_at ${topUp(t.id).checked_at}`);
    // Now the same order, in a real checkout window on a phone.
    const h = await harnessCheckout(t.order, { mobile: true });
    try {
      await payUpiIntent(h.frame);
      const proof = await L.until(h.proof, { timeout: 60000, every: 500, what: 'checkout handler' });
      ctx.note('handlerProof', `payment ${proof.razorpay_payment_id}`);
      const rp = await rzpPaymentIn(t.order, ['captured'], 30000);
      ctx.check('Razorpay: the second attempt captured', rp.status === 'captured' && rp.id === proof.razorpay_payment_id, brief(rp));
      const ok = await confirmTopUpApi(t, { paymentId: proof.razorpay_payment_id, signature: proof.razorpay_signature }, token);
      ctx.note('confirmAfterSuccess', `${ok.status}${ok.error ? ' ' + ok.error.code : ''}`);
      ctx.check('confirm after success answers 200', ok.status === 200, `${ok.status} ${ok.error?.code}`);
    } finally { await h.page.close(); }
    ctx.check('credited once, for the amount', near(balance() - before, amount) && ledgerOf(t.id).length === 1, `${before} -> ${balance()}, ${ledgerOf(t.id).length} row(s)`);
    const row = topUp(t.id);
    ctx.row('wallet_top_up', row);
    ctx.check('we recorded the successful attempt, not the failed one', row.razorpay_payment_id && row.razorpay_payment_id !== failed.id && row.payment_method === 'upi',
      `${row.razorpay_payment_id} ${row.payment_method}`);
    ctx.note('razorpayAttempts', (await rzpOrderPayments(t.order)).map(brief));
    ctx.log(mark, topUpTerms(t));
  }, { retries: 0 });

  // ── ORDERS ──

  await test('O1', 'order paid by UPI intent, held, captured at ready', 'AUTHORIZED at Razorpay until ready; then captured; rows consistent', async (ctx) => {
    const mark = logMark();
    const o = await openOrderCheckout({ mobile: true });
    try {
      await payOrderByUpi(ctx, o);
      await L.until(() => orderRow(o.orderId).status === 'CONFIRMED', { timeout: 40000, what: 'order confirmed by our server' }).catch(() => {});
      const held = payment(o.paymentId);
      ctx.row('payment_held', held);
      ctx.note('orderAfterPay', JSON.stringify(orderRow(o.orderId)));
      const rp = await L.rzp(`/v1/payments/${held.provider_payment_id}`);
      ctx.note('razorpayBeforeReady', brief(rp));
      ctx.check('our payment AUTHORIZED', held.status === 'AUTHORIZED', held.status);
      ctx.check('order confirmed by our server', orderRow(o.orderId).status === 'CONFIRMED', orderRow(o.orderId).status);
      ctx.check('Razorpay: upi, authorized, not captured', rp.method === 'upi' && rp.status === 'authorized' && !rp.captured, brief(rp));
      ctx.note('appAfterPay', flat(await o.page.evaluate(() => document.body.innerText)).slice(0, 250));
      await snapshot(o.page, 'O1-paid');
      const readyAt = Date.now();
      await L.dispatch(o.orderId);
      await L.until(() => payment(o.paymentId).status === 'CAPTURED', { timeout: 60000, what: 'capture at ready' });
      ctx.timings.readyToCapturedSecs = Math.round((Date.now() - readyAt) / 100) / 10;
      const done = payment(o.paymentId);
      ctx.row('payment_after', done);
      ctx.row('payment_transaction', paymentTx(o.paymentId));
      ctx.row('wallet_transaction_for_order', walletTxOfOrder(o.orderId));
      const after = await L.rzp(`/v1/payments/${done.provider_payment_id}`);
      ctx.note('razorpayAfterReady', brief(after));
      ctx.check('Razorpay: captured for our amount', after.status === 'captured' && after.amount === Math.round(Number(done.captured_amount) * 100), `${after.status} ${after.amount} vs ${done.captured_amount}`);
      ctx.check('order READY_FOR_PICKUP', orderRow(o.orderId).status === 'READY_FOR_PICKUP', orderRow(o.orderId).status);
      ctx.check('payment_transaction has AUTHORIZE and CAPTURE, both SUCCESS',
        ['AUTHORIZE', 'CAPTURE'].every((k) => paymentTx(o.paymentId).some((r) => r.transaction_type === k && r.status === 'SUCCESS')),
        paymentTx(o.paymentId).map((r) => `${r.transaction_type}:${r.status}`).join(','));
      ctx.note('paymentMethodColumn', `payment.payment_method=${done.payment_method} (Razorpay says ${after.method})`);
      orderCase = { orderId: o.orderId, paymentId: o.paymentId, providerPaymentId: done.provider_payment_id };
      ctx.log(mark, orderTerms(o));
    } finally { await L.adoptSession(o.page); await o.page.close(); }
  });

  await test('O2', 'UPI order cancelled by the supplier before ready', 'record what we say and what Razorpay says; flag any mismatch', async (ctx) => {
    const mark = logMark();
    const o = await openOrderCheckout({ mobile: true });
    try {
      await payOrderByUpi(ctx, o);
      await L.until(() => orderRow(o.orderId).status === 'CONFIRMED', { timeout: 40000, what: 'confirmed' }).catch(() => {});
      const held = payment(o.paymentId);
      const before = await L.rzp(`/v1/payments/${held.provider_payment_id}`);
      ctx.note('razorpayBeforeCancel', brief(before));
      const cancelAt = Date.now();
      const r = await L.api(`/supplier-orders/${o.orderId}/supplier-cancel`, {
        body: { reason: 'OUT_OF_STOCK' }, token: await sellerToken(), headers: idem() });
      ctx.check('supplier cancel accepted', r.status === 200, `${r.status} ${r.error?.code}`);
      const snap = async (label) => {
        const p = payment(o.paymentId);
        const rz = await L.rzp(`/v1/payments/${held.provider_payment_id}`);
        const rf = await L.rzp(`/v1/payments/${held.provider_payment_id}/refunds`);
        return { label, order: orderRow(o.orderId), payment: p, paymentTx: paymentTx(o.paymentId), refundRowsOurs: refundsOf(o.paymentId),
          walletRows: walletTxOfOrder(o.orderId), razorpay: brief(rz), razorpayRefundCount: rf.count, razorpayRefundStatus: rz.refund_status };
      };
      const first = await snap('right after cancel');
      ctx.row('right_after_cancel', first);
      ctx.timings.cancelToReleasedSecs = Math.round((Date.now() - cancelAt) / 100) / 10;
      await snapshot(o.page, 'O2-before-reload');
      await o.page.goto(L.WEB + `/restaurant/pay/${o.orderId}`, { waitUntil: 'networkidle2' }).catch(() => {});
      ctx.note('restaurantPayScreenAfterCancel', flat(await o.page.evaluate(() => document.body.innerText)).slice(0, 300));
      await sleep(150000);
      const later = await snap('2.5 minutes later');
      ctx.row('after_2_5_min', later);
      ctx.check('order CANCELLED', first.order.status === 'CANCELLED', first.order.status);
      ctx.check('our payment RELEASED, nothing captured', first.payment.status === 'RELEASED' && Number(first.payment.captured_amount) === 0, `${first.payment.status} captured=${first.payment.captured_amount} released=${first.payment.released_amount}`);
      ctx.check('Razorpay still holds the money as authorized (never captured, no refund raised)', /authorized/.test(first.razorpay) && first.razorpayRefundCount === 0, `${first.razorpay}; refunds at Razorpay=${first.razorpayRefundCount}`);
      // The key risk: for UPI the payer is already debited. Say so as a finding, never as a pass.
      ctx.check('MISMATCH CHECK: our DB says RELEASED while Razorpay holds a debited UPI payment (should be FALSE to pass)',
        !(first.payment.status === 'RELEASED' && /authorized/.test(later.razorpay)),
        `ours=${later.payment.status}; Razorpay=${later.razorpay}; refund_status=${later.razorpayRefundStatus}`);
      ctx.log(mark, orderTerms(o));
    } finally { await L.adoptSession(o.page); await o.page.close(); }
  });

  await test('O3', 'UPI order captured, dispute refund to wallet, withdrawal to source', 'wallet credit; Razorpay refund on the UPI payment', async (ctx) => {
    if (!orderCase) throw new Error('needs O1 (its captured order)');
    const mark = logMark();
    const { orderId, paymentId, providerPaymentId } = orderCase;
    const buyer = await buyerToken();
    const disputeId = await L.disputedOrder(orderId);
    const limit = (await L.api(`/disputes/${disputeId}/refund-limit`, { token: buyer })).data;
    ctx.note('refundLimit', JSON.stringify(limit));
    const req = await L.api(`/disputes/${disputeId}/refund-request`, { body: { amount: '50.00', reason: 'e2e UPI: two packs sour' }, token: buyer, headers: idem() });
    ctx.check('refund requested', req.status === 200, `${req.status} ${req.error?.code}`);
    const walletBefore = balance();
    const approve = await L.api(`/dispute-refunds/${req.data.id}/approve`, { body: {}, token: await sellerToken(), headers: idem() });
    ctx.check('supplier approved it', approve.status === 200, `${approve.status} ${approve.error?.code}`);
    ctx.check('wallet credited 50', near(balance() - walletBefore, 50), `${walletBefore} -> ${balance()}`);
    ctx.row('refund_rows_after_approval', refundsOf(paymentId));
    ctx.row('wallet_rows_for_order', walletTxOfOrder(orderId));
    const atRazorpay = await L.rzp(`/v1/payments/${providerPaymentId}/refunds`);
    ctx.check('nothing at Razorpay yet (money went to the wallet)', atRazorpay.count === 0, `refunds=${atRazorpay.count}`);
    // A withdrawal spends the oldest refund credits first; older ones on this wallet may belong to
    // payments made under an earlier key, so record every part and what became of each.
    const withdrawable = rowsOf(`select r.payment_id, sum(case when r.destination='WALLET' and r.status='COMPLETED' then r.amount else 0 end)
        - sum(case when r.reason='WALLET_WITHDRAWAL' then r.amount else 0 end) as available
        from refund r join payment p on p.id=r.payment_id where p.outlet_id=1 group by r.payment_id having available > 0
        order by min(case when r.destination='WALLET' then r.created_at end), r.payment_id`, ['payment_id', 'available']);
    ctx.note('withdrawableSourcesBefore', JSON.stringify(withdrawable));
    const total = withdrawable.reduce((s, r) => s + Number(r.available), 0);
    const w = await L.api('/outlets/1/wallet/withdraw', { body: { amount: total.toFixed(2) }, token: buyer, headers: idem() });
    ctx.note('withdrawAnswer', `${w.status} ${w.error?.code || ''} parts=${JSON.stringify(w.data?.parts)}`);
    ctx.check('withdrawal accepted', w.status === 200, `${w.status} ${w.error?.code} ${w.error?.message}`);
    const mine = (w.data?.parts || []).find((p) => Number(p.paymentId) === paymentId);
    ctx.check('one part is a refund on the UPI payment', !!mine, JSON.stringify(w.data?.parts));
    if (mine) {
      const done = await L.until(() => ['COMPLETED', 'FAILED'].includes(L.db(`select status from refund where id=${mine.refundId}`)) || null,
        { timeout: 150000, every: 3000, what: 'the withdrawal refund to settle' }).catch(() => null);
      const row = refundsOf(paymentId).find((r) => Number(r.id) === Number(mine.refundId));
      ctx.row('withdrawal_refund_row', row);
      ctx.check('our refund COMPLETED', done && row.status === 'COMPLETED', row && `${row.status} attempts=${row.attempts} ${row.failure_code || ''}`);
      const rf = (await L.rzp(`/v1/payments/${providerPaymentId}/refunds`)).items || [];
      ctx.note('razorpayRefunds', rf.map((x) => `${x.id} ${x.status} ${x.amount} speed=${x.speed_processed || x.speed_requested}`));
      ctx.check('Razorpay has a 50.00 refund on the UPI payment', rf.some((x) => x.amount === 5000), rf.map((x) => `${x.id} ${x.status} ${x.amount}`).join('; '));
      const rp = await L.rzp(`/v1/payments/${providerPaymentId}`);
      ctx.note('razorpayPaymentAfter', `${brief(rp)} refund_status=${rp.refund_status}`);
    }
    ctx.row('other_parts', (w.data?.parts || []).filter((p) => Number(p.paymentId) !== paymentId).map((p) => ({ ...p, rowNow: refundsOf(p.paymentId).find((r) => Number(r.id) === Number(p.refundId)) })));
    ctx.note('walletAfter', `balance=${balance()} ledgerSum=${ledgerSum()}`);
    ctx.check('sum(ledger) == balance', near(ledgerSum(), balance()), `${ledgerSum()} vs ${balance()}`);
    ctx.log(mark, [providerPaymentId, new RegExp(`[Rr]efund ${mine ? mine.refundId : 'x'}\\b`), new RegExp(`\\b[Pp]ayment=${paymentId}\\b`)]);
  }, { retries: 0 });

  await test('O4', 'UPI failure on an order, then success on the same order', 'stays payable after failure; one payment after success', async (ctx) => {
    const mark = logMark();
    const o = await L.placedOrder(1);
    const paise = Math.round(Number(payment(o.paymentId).authorized_amount) * 100);
    const fail = await upiFailure(o.providerOrderId, paise);
    ctx.note('createAjax', `${fail.status} ${fail.json.type || fail.error || ''}`);
    const failed = await rzpPaymentIn(o.providerOrderId, ['failed'], 30000);
    ctx.check('Razorpay: the UPI attempt failed', failed.status === 'failed', brief(failed));
    const token = await buyerToken();
    const c1 = await L.api(`/payments/${o.paymentId}/confirm`, { body: { providerPaymentId: failed.id }, token });
    ctx.note('confirmWithFailedId', `${c1.status} ${c1.error?.code || ''} payment.status=${c1.data?.status}`);
    ctx.row('payment_after_failure', payment(o.paymentId));
    ctx.row('payment_transaction_after_failure', paymentTx(o.paymentId));
    ctx.check('our payment stays CREATED (payable)', payment(o.paymentId).status === 'CREATED', payment(o.paymentId).status);
    ctx.check('order still DRAFT', orderRow(o.orderId).status === 'DRAFT', orderRow(o.orderId).status);
    const intent = await L.api(`/supplier-orders/${o.orderId}/payment-intent`, { token });
    ctx.check('payment-intent still says payable', intent.data?.payable === true, JSON.stringify({ payable: intent.data?.payable, status: intent.data?.status }));
    const h = await harnessCheckout(o.providerOrderId, { mobile: true });
    try {
      await payUpiIntent(h.frame);
      const proof = await L.until(h.proof, { timeout: 60000, every: 500, what: 'checkout handler' });
      const rp = await rzpPaymentIn(o.providerOrderId, ['authorized', 'captured'], 30000);
      ctx.note('razorpaySecondAttempt', brief(rp));
      const c2 = await L.api(`/payments/${o.paymentId}/confirm`, { body: { providerPaymentId: proof.razorpay_payment_id }, token });
      ctx.check('confirm of the successful attempt answers 200', c2.status === 200, `${c2.status} ${c2.error?.code}`);
    } finally { await h.page.close(); }
    await L.until(() => orderRow(o.orderId).status === 'CONFIRMED', { timeout: 40000, what: 'order confirmed' }).catch(() => {});
    ctx.row('payment_after_success', payment(o.paymentId));
    ctx.row('payment_transaction_after_success', paymentTx(o.paymentId));
    ctx.check('our payment AUTHORIZED with the second attempt id', payment(o.paymentId).status === 'AUTHORIZED' && payment(o.paymentId).provider_payment_id !== failed.id,
      `${payment(o.paymentId).status} ${payment(o.paymentId).provider_payment_id}`);
    ctx.check('order CONFIRMED', orderRow(o.orderId).status === 'CONFIRMED', orderRow(o.orderId).status);
    const third = await upiIntent(o.providerOrderId, paise);
    ctx.note('thirdAttempt', `${third.status} ${third.error || third.json.type}`);
    const all = await rzpOrderPayments(o.providerOrderId);
    ctx.note('razorpayAttempts', all.map(brief));
    ctx.check('a third payment on the paid order is refused; only one payment holds money',
      all.filter((p) => ['authorized', 'captured'].includes(p.status)).length === 1, all.map(brief).join('; '));
    ctx.log(mark, orderTerms(o));
  }, { retries: 0 });

  await test('O5', 'UPI paid, page closed before our confirm', 'something later confirms it (poll/reconcile); how long', async (ctx) => {
    const mark = logMark();
    const o = await openOrderCheckout({ mobile: true, block: true });   // any confirm the page tries is held back
    const frame = await checkoutFrame(o.page);
    const tapped = await payUpiIntent(frame);
    const p = await rzpPaymentIn(o.providerOrderId, ['authorized', 'captured'], 30000);
    const paidSeen = Date.now();
    await o.page.close();
    ctx.timings.tapToRazorpayPaidSecs = Math.round((paidSeen - tapped) / 100) / 10;
    ctx.note('razorpay', brief(p));
    ctx.check('no confirm reached us from the page', o.confirms.length === 0, `${o.confirms.length} attempt(s), blocked`);
    ctx.check('our payment still CREATED right after the kill', payment(o.paymentId).status === 'CREATED', payment(o.paymentId).status);
    const samples = [];
    let confirmedAt = null;
    const end = Date.now() + 8 * 60000;
    while (Date.now() < end) {
      const st = payment(o.paymentId).status;
      const os = orderRow(o.orderId).status;
      if (samples.length === 0 || samples[samples.length - 1].split(' ').slice(1).join(' ') !== `${st} ${os}`) samples.push(`+${Math.round((Date.now() - paidSeen) / 1000)}s ${st} ${os}`);
      if (st !== 'CREATED') { confirmedAt = Date.now(); break; }
      await sleep(5000);
    }
    ctx.note('stateChanges', samples);
    if (confirmedAt) {
      ctx.timings.paidToConfirmedSecs = Math.round((confirmedAt - paidSeen) / 100) / 10;
      await L.until(() => orderRow(o.orderId).status === 'CONFIRMED', { timeout: 30000, what: 'order confirmed' }).catch(() => {});
    }
    ctx.row('payment', payment(o.paymentId));
    ctx.row('payment_transaction', paymentTx(o.paymentId));
    ctx.row('order', orderRow(o.orderId));
    ctx.check('the payment was found and the order confirmed without the client', !!confirmedAt && orderRow(o.orderId).status === 'CONFIRMED',
      confirmedAt ? `after ${ctx.timings.paidToConfirmedSecs}s` : 'never within 8 minutes');
    ctx.log(mark, orderTerms(o));
  }, { retries: 0 });

  await test('O6', 'UPI paid, immediately pay again by card on the same order', 'refused; one payment; no Pay offered', async (ctx) => {
    const mark = logMark();
    const o = await openOrderCheckout({ mobile: true });
    try {
      const frame = await checkoutFrame(o.page);
      await payUpiIntent(frame);
      const paid = await rzpPaymentIn(o.providerOrderId, ['authorized', 'captured'], 30000);
      const paise = paid.amount;
      const card = await cardAttempt(o.providerOrderId, paise);
      ctx.note('cardAttemptAnswer', `${card.status} ${card.error || card.json.type || ''}`);
      const upi2 = await upiIntent(o.providerOrderId, paise);
      ctx.note('secondUpiAnswer', `${upi2.status} ${upi2.error || upi2.json.type || ''}`);
      await L.until(() => payment(o.paymentId).status !== 'CREATED', { timeout: 60000, what: 'our payment held' });
      const all = await rzpOrderPayments(o.providerOrderId);
      ctx.note('razorpayAttempts', all.map(brief));
      ctx.check('the card attempt is refused by Razorpay', card.status >= 400 || !!card.error, `${card.status} ${card.error}`);
      ctx.check('exactly one payment holds money at Razorpay', all.filter((p) => ['authorized', 'captured'].includes(p.status)).length === 1, all.map(brief).join('; '));
      ctx.check('our payment AUTHORIZED against that one payment', payment(o.paymentId).status === 'AUTHORIZED' && payment(o.paymentId).provider_payment_id === paid.id,
        `${payment(o.paymentId).status} ${payment(o.paymentId).provider_payment_id} vs ${paid.id}`);
      const intent = await L.api(`/supplier-orders/${o.orderId}/payment-intent`, { token: await buyerToken() });
      ctx.check('our payment-intent says not payable', intent.data?.payable === false, JSON.stringify({ payable: intent.data?.payable, status: intent.data?.status }));
      await o.page.goto(L.WEB + `/restaurant/pay/${o.orderId}`, { waitUntil: 'networkidle2' });
      await sleep(2500);
      const text = flat(await o.page.evaluate(() => document.body.innerText));
      const pay = await o.page.evaluate(() => [...document.querySelectorAll('[role=button]')]
        .filter((e) => e.offsetParent !== null && /^(Pay |Try Again)/.test(e.textContent.trim())).map((e) => e.textContent.trim()));
      ctx.note('payScreenAfterPaid', text.slice(0, 300));
      ctx.check('the pay screen offers no Pay / Try Again', pay.length === 0, JSON.stringify(pay));
      // A checkout window opened again on the paid order.
      const h = await harnessCheckout(o.providerOrderId, { mobile: true });
      try {
        await sleep(6000);
        ctx.note('reopenedCheckoutShows', flat(await frameText(h.frame)).slice(0, 250));
      } finally { await h.page.close(); }
      ctx.row('payment', payment(o.paymentId));
      ctx.log(mark, orderTerms(o));
    } finally { await L.adoptSession(o.page); await o.page.close(); }
  }, { retries: 0 });

  // T6 last: it leaves extra money in the local wallet (see the note in the report).
  await test('T6', 'UPI payment succeeded but a wallet limit would be breached at credit time', 'not credited; refunded to source; refund lands', async (ctx) => {
    const mark = logMark();
    const bal = balance();
    const room = Math.floor(100000 - bal);
    const each = Math.floor(room / 2) + 500;   // each passes the check at creation; together they cannot both be credited
    if (each > room || each < 10) throw new Error(`cannot build the race with balance ${bal}`);
    const a = await apiTopUp(each);
    const c = await apiTopUp(each + 1);
    ctx.note('amounts', `A=${each} B=${each + 1}, balance before ${bal}, max 100000 (default)`);
    const token = await buyerToken();
    const proofs = {};
    for (const t of [a, c]) {
      const r = await upiIntent(t.order, t.paise);
      if (r.status !== 200) throw new Error('intent ' + r.status + ' ' + r.error);
      const p = await rzpPaymentIn(t.order, ['captured'], 30000);
      proofs[t.id] = { paymentId: p.id, signature: sign(t.order, p.id) };
    }
    const first = await confirmTopUpApi(a, proofs[a.id], token);
    ctx.check('A credited', first.status === 200 && topUp(a.id).status === 'CREDITED', `${first.status} ${topUp(a.id).status}`);
    const second = await confirmTopUpApi(c, proofs[c.id], token);
    ctx.note('confirmOfBreachingTopUp', `${second.status} ${second.error?.code} ${second.error?.message}`);
    ctx.check('B answered WALLET_LIMIT_EXCEEDED', second.error?.code === 'WALLET_LIMIT_EXCEEDED', `${second.status} ${second.error?.code}`);
    ctx.check('B not credited', near(balance() - bal, each), `balance ${bal} -> ${balance()}`);
    const settled = await L.until(() => ['REFUNDED'].includes(topUp(c.id).status) || null, { timeout: 200000, every: 3000, what: 'refund to land' }).catch(() => null);
    const rowB = topUp(c.id);
    ctx.row('wallet_top_up_B', rowB);
    ctx.row('wallet_top_up_A', topUp(a.id));
    ctx.check('B REFUNDED', !!settled && rowB.status === 'REFUNDED', `${rowB.status} attempts=${rowB.refund_attempts}`);
    const rf = (await L.rzp(`/v1/payments/${proofs[c.id].paymentId}/refunds`)).items || [];
    ctx.note('razorpayRefund', rf.map((x) => `${x.id} ${x.status} ${x.amount} speed=${x.speed_processed || x.speed_requested}`));
    ctx.check('Razorpay refunded the whole UPI payment', rf.some((x) => x.amount === c.paise), rf.map((x) => `${x.status} ${x.amount}`).join('; '));
    ctx.check('no ledger row for B', ledgerOf(c.id).length === 0, `${ledgerOf(c.id).length}`);
    ctx.check('sum(ledger) == balance', near(ledgerSum(), balance()), `${ledgerSum()} vs ${balance()}`);
    ctx.log(mark, [...topUpTerms(a), ...topUpTerms(c), proofs[c.id].paymentId]);
  }, { retries: 0 });

  await b.close();

  // ── report ──
  const tally = results.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] || 0) + 1 }), {});
  console.log('\n' + JSON.stringify(tally));
  fs.writeFileSync(REPORT, JSON.stringify({ started, finished: new Date().toISOString(), results }, null, 1));
  console.log('report: ' + REPORT);
  process.exit(results.every((r) => r.verdict === 'PASS') ? 0 : 1);
})().catch(async (e) => { console.error(e); if (b) await b.close(); process.exit(2); });
