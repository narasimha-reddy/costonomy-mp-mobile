/* global __dirname, Buffer */
// Shared helpers for the Razorpay test-mode suite. LOCAL stack only:
// API localhost:7070, web localhost:7071, MySQL 127.0.0.1, Razorpay TEST keys.
// See README.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

// The API repo is expected beside this one; override with API_REPO.
const API_REPO = process.env.API_REPO || path.resolve(__dirname, '../../../costonomy-mp-api');
const API = (process.env.API || 'http://localhost:7070/costonomy-mp-api') + '/api/v1';
const WEB = process.env.WEB || 'http://localhost:7071';
const CACHE = path.join(__dirname, '.sessions.json');
// Keys and the database password come from the API's gitignored local config —
// the same file the API reads — so nothing secret is duplicated here.
const PROPS = fs.readFileSync(`${API_REPO}/src/main/resources/application-local.properties`, 'utf8');
const prop = (k) => (PROPS.split('\n').find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1).trim();

const KEY_ID = prop('costonomy.mp.razorpay.key-id');
const KEY_SECRET = prop('costonomy.mp.razorpay.key-secret');
const WEBHOOK_SECRET = prop('costonomy.mp.razorpay.webhook-secret');
if (!KEY_ID.startsWith('rzp_test_')) throw new Error('Refusing to run: not a Razorpay TEST key');

const BUYER = '+919876500004';   // Spice Garden, outlet 1
const SELLER = '+919876511001';  // Sri Balaji, store 1
const STRANGER = '+919876500007'; // Tandoor House — another tenant

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, { method, body, token, headers, raw } = {}) {
  const res = await fetch(API + pathname, {
    method: method || (body !== undefined || raw !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, data: json?.data, error: json?.error };
}

function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; } }
function saveCache(c) { fs.writeFileSync(CACHE, JSON.stringify(c), { mode: 0o600 }); }

/** Access + refresh token for a phone, reusing a cached refresh token to avoid the OTP cooldown. */
async function session(phone) {
  const cache = loadCache();
  if (cache[phone]) {
    const r = await api('/auth/refresh', { body: { refreshToken: cache[phone].refreshToken } });
    if (r.status === 200) { cache[phone] = r.data; saveCache(cache); return r.data; }
  }
  for (;;) {
    const req = await api('/auth/otp/request', { body: { phone, purpose: 'LOGIN' } });
    if (req.status === 429 || req.error?.code === 'OTP_RESEND_TOO_SOON') {
      const wait = (req.error?.details?.retryAfterSeconds ?? 60) + 1;
      console.log(`    (waiting ${wait}s for ${phone}'s OTP cooldown)`);
      await sleep(wait * 1000);
      continue;
    }
    break;
  }
  const v = await api('/auth/otp/verify', { body: { phone, otp: '123456', purpose: 'LOGIN' } });
  if (v.status !== 200) throw new Error('login failed ' + JSON.stringify(v.error));
  cache[phone] = v.data; saveCache(cache);
  return v.data;
}

const LOCAL_MYSQL = `${process.env.HOME}/.local/opt/mysql/bin/mysql`;
const MYSQL = process.env.MYSQL_BIN || (fs.existsSync(LOCAL_MYSQL) ? LOCAL_MYSQL : 'mysql');

function db(sql) {
  return execFileSync(MYSQL,
    ['-h', process.env.MYSQL_HOST || '127.0.0.1', '-P', process.env.MYSQL_PORT || '3306',
      `-u${prop('spring.datasource.username') || 'root'}`,
      process.env.MYSQL_DATABASE || 'costonomy_mp', '-N', '-e', sql],
    // The password in the environment, not the command line: a failed command's
    // error message repeats its arguments, and those reached report.json.
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, MYSQL_PWD: prop('spring.datasource.password') } }).trim();
}

/** Read-only calls to Razorpay's TEST API, for asserting what Razorpay itself recorded. */
async function rzp(pathname) {
  const res = await fetch('https://api.razorpay.com' + pathname, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64') },
  });
  return res.json();
}

function signWebhook(body) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

let sku;
/** A request the supplier has accepted in full, ready for the restaurant to order and pay. */
async function acceptedRequest(quantity = 2) {
  const buyer = (await session(BUYER)).accessToken;
  const seller = (await session(SELLER)).accessToken;
  sku = sku || Number(db("select id from supplier_sku where supplier_store_id=1 and status='ACTIVE' order by id limit 1"));
  const draft = await api('/outlets/1/intent-items', { body: { supplierSkuId: sku, quantity }, token: buyer });
  if (draft.status !== 200) throw new Error('draft ' + JSON.stringify(draft.error));
  const intentId = draft.data.id;
  const itemId = draft.data.items[0].id;
  const sent = await api(`/intents/${intentId}/send`, { body: {}, token: buyer });
  if (sent.status !== 200) throw new Error('send ' + JSON.stringify(sent.error));
  const r = await api(`/intents/${intentId}/respond`, {
    body: { lines: [{ intentItemId: itemId, offeredQuantity: quantity }] }, token: seller,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  if (r.status !== 200) throw new Error('respond ' + JSON.stringify(r.error));
  return intentId;
}

/** An order with a payment intent, created through the API (no browser). */
async function placedOrder(quantity = 2) {
  const intentId = await acceptedRequest(quantity);
  const buyer = (await session(BUYER)).accessToken;
  const r = await api(`/intents/${intentId}/orders`, {
    body: { deliveryMode: 'PICKUP' }, token: buyer, headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  if (r.status !== 200) throw new Error('order ' + JSON.stringify(r.error));
  return { orderId: r.data.supplierOrderId, paymentId: r.data.payment.paymentId,
           providerOrderId: r.data.payment.providerOrderId, intentId };
}

const orderStatus = (id) => db(`select status from supplier_order where id=${id}`);
const paymentRow = (id) => {
  const [status, providerPaymentId, authorized, captured] =
    db(`select status, coalesce(provider_payment_id,''), authorized_amount, captured_amount from payment where id=${id}`).split('\t');
  return { status, providerPaymentId, authorized, captured };
};
const paymentIdForOrder = (orderId) => Number(db(`select id from payment where supplier_order_id=${orderId}`));

async function until(fn, { timeout = 30000, every = 1000, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

// ── browser ────────────────────────────────────────────────────────────

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function browser({ headless = process.env.HEADED !== '1' } = {}) {
  return puppeteer.launch({
    executablePath: CHROME, headless: headless ? 'new' : false,
    defaultViewport: { width: 430, height: 932 },
    args: ['--window-size=430,932'],
  });
}

/** A page signed in as the buyer, on a path in the web app. */
async function signedInPage(b, pathname) {
  const s = await session(BUYER);
  // Incognito per test: Razorpay remembers a contact number across payments in
  // one profile, which would make each test depend on the one before it.
  const context = await b.createBrowserContext();
  const page = await context.newPage();
  await page.goto(WEB + '/welcome', { waitUntil: 'networkidle2' });
  await page.evaluate((a, r) => { localStorage.setItem('mp.accessToken', a); localStorage.setItem('mp.refreshToken', r); },
    s.accessToken, s.refreshToken);
  await page.goto(WEB + pathname, { waitUntil: 'networkidle2' });
  return page;
}

/**
 * The app rotates the refresh token as it runs, which revokes the one we hold.
 * Take whatever the page now has, so the next session() refreshes instead of
 * spending an OTP (and a minute of cooldown).
 */
async function adoptSession(page) {
  const t = await page.evaluate(() => ({ accessToken: localStorage.getItem('mp.accessToken'),
                                         refreshToken: localStorage.getItem('mp.refreshToken') }));
  if (t.refreshToken) { const c = loadCache(); c[BUYER] = t; saveCache(c); }
}

/** Click the last visible [role=button] whose text starts with `label` (expo-router keeps old screens mounted). */
async function tap(page, label, { timeout = 15000 } = {}) {
  await page.waitForFunction((t) => [...document.querySelectorAll('[role=button]')]
    .some((e) => e.offsetParent !== null && e.textContent.trim().startsWith(t)), { timeout }, label);
  await page.evaluate((t) => {
    const els = [...document.querySelectorAll('[role=button]')]
      .filter((e) => e.offsetParent !== null && e.textContent.trim().startsWith(t));
    els[els.length - 1].click();
  }, label);
}

const visibleText = (page) => page.evaluate(() => document.body.innerText);

/**
 * Click inside Razorpay's iframe. Its React UI replaces nodes as it renders, so a
 * handle can detach between finding and clicking; re-find and retry instead.
 */
async function fclick(frame, selector, { timeout = 20000 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      await frame.waitForSelector(selector, { visible: true, timeout: Math.max(1000, end - Date.now()) });
      await sleep(300);
      const ok = await frame.evaluate((sel) => {
        const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
        if (!el) return false; el.click(); return true;
      }, selector);
      if (ok) return;
    } catch (e) { if (Date.now() > end) throw e; }
    if (Date.now() > end) throw new Error('could not click ' + selector);
    await sleep(500);
  }
}

/** Type into an iframe input, retrying if the node is replaced mid-way. */
async function ftype(frame, selector, text, { timeout = 20000 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      await frame.waitForSelector(selector, { visible: true, timeout: Math.max(1000, end - Date.now()) });
      await sleep(300);
      await frame.click(selector, { clickCount: 3 });
      await frame.type(selector, text, { delay: 20 });
      return;
    } catch (e) { if (Date.now() > end) throw e; await sleep(500); }
  }
}

module.exports = {
  API, WEB, KEY_ID, BUYER, SELLER, STRANGER, sleep, api, session, db, rzp, signWebhook,
  acceptedRequest, placedOrder, orderStatus, paymentRow, paymentIdForOrder, until,
  browser, signedInPage, adoptSession, tap, visibleText, fclick, ftype,
};
