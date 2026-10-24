/* global __dirname */
// Shared helpers for the Credit end-to-end suite. LOCAL stack only:
// API localhost:7070, MySQL 127.0.0.1 (costonomy_mp). See README.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const API_ROOT = process.env.API || 'http://localhost:7070/costonomy-mp-api';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(API_ROOT + '/')) {
  throw new Error('Refusing to run: API must be a local host, got ' + API_ROOT);
}
const API = API_ROOT + '/api/v1';
// The API repo: API_REPO, else beside this repo, else the usual place under ~/Documents/costonomyprojects.
const API_REPO = [process.env.API_REPO, path.resolve(__dirname, '../../../costonomy-mp-api'),
  path.join(process.env.HOME || '', 'Documents/costonomyprojects/costonomy-mp-api')]
  .filter(Boolean)
  .find((d) => fs.existsSync(`${d}/src/main/resources/application-local.properties`))
  || path.resolve(__dirname, '../../../costonomy-mp-api');
const CACHE = path.join(__dirname, '.sessions.json');

// The database password comes from the API's gitignored local config, at run
// time, and goes to the mysql client through the environment only. It is never
// printed, logged or written anywhere.
const PROPS = (() => {
  try { return fs.readFileSync(`${API_REPO}/src/main/resources/application-local.properties`, 'utf8'); } catch { return ''; }
})();
const prop = (k) => (PROPS.split('\n').find((l) => l.startsWith(k + '=')) || '').slice(k.length + 1).trim();

const LOCAL_MYSQL = `${process.env.HOME}/.local/opt/mysql/bin/mysql`;
const MYSQL = process.env.MYSQL_BIN || (fs.existsSync(LOCAL_MYSQL) ? LOCAL_MYSQL : 'mysql');

/** Run SQL, return the raw trimmed tab-separated output (no header). */
function dbRaw(sql) {
  return execFileSync(MYSQL,
    ['-h', process.env.MYSQL_HOST || '127.0.0.1', '-P', process.env.MYSQL_PORT || '3306',
      `-u${prop('spring.datasource.username') || 'costonomy'}`,
      process.env.MYSQL_DATABASE || 'costonomy_mp', '-N', '-B', '-e', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MYSQL_PWD: prop('spring.datasource.password') } }).trim();
}
/** Rows as arrays of strings ('NULL' stays the string NULL). */
function db(sql) {
  let out;
  try { out = dbRaw(sql); } catch (e) { throw new Error('SQL failed: ' + sql.slice(0, 120) + ' :: ' + String(e.stderr || '').replace(/Using a password.*\n?/, '').slice(0, 200)); }
  return out === '' ? [] : out.split('\n').map((r) => r.split('\t'));
}
const dbVal = (sql) => (db(sql)[0] || [])[0];
const dbNum = (sql) => Number(dbVal(sql));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();
const RUN = Date.now().toString(36); // unique per run, goes into keys, notes and references
let keyN = 0;
const key = (label = 'k') => `e2e-${RUN}-${label}-${++keyN}`;

async function api(pathname, { method, body, token, headers } = {}) {
  const res = await fetch(API + pathname, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data: json?.data, error: json?.error, raw: json };
}

// ── login (OTP 123456, cached) ─────────────────────────────────────────
function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; } }
function saveCache(c) { fs.writeFileSync(CACHE, JSON.stringify(c), { mode: 0o600 }); }
const tokenCache = {};

/** Access token for a phone. Reuses an in-memory token, then a cached unexpired one, then the refresh token, then OTP. */
async function login(phone) {
  const now = Date.now();
  if (tokenCache[phone] && tokenCache[phone].exp > now + 30000) return tokenCache[phone].token;
  const cache = loadCache();
  const keep = (data) => {
    // 15-minute access tokens; stay a minute inside that.
    tokenCache[phone] = { token: data.accessToken, exp: Date.now() + 14 * 60 * 1000 };
    cache[phone] = { ...data, savedAt: Date.now() };
    saveCache(cache);
    return data.accessToken;
  };
  const c = cache[phone];
  if (c && c.accessToken && c.savedAt && Date.now() - c.savedAt < 13 * 60 * 1000) {
    tokenCache[phone] = { token: c.accessToken, exp: c.savedAt + 14 * 60 * 1000 };
    return c.accessToken;
  }
  if (c && c.refreshToken) {
    const r = await api('/auth/refresh', { body: { refreshToken: c.refreshToken } });
    if (r.status === 200) return keep(r.data);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const req = await api('/auth/otp/request', { body: { phone, purpose: 'LOGIN' } });
    if (req.status === 429 || req.error?.code === 'OTP_RESEND_TOO_SOON') {
      const wait = (req.error?.details?.retryAfterSeconds ?? 60) + 1;
      console.log(`    (waiting ${wait}s for ${phone}'s OTP cooldown)`);
      await sleep(wait * 1000);
      continue;
    }
    if (req.status >= 400) throw new Error(`otp request failed for ${phone}: ${req.status} ${req.error?.code}`);
    const v = await api('/auth/otp/verify', { body: { phone, otp: '123456', purpose: 'LOGIN' } });
    if (v.status !== 200) throw new Error(`login failed for ${phone}: ${v.status} ${v.error?.code}`);
    return keep(v.data);
  }
  throw new Error('login: gave up waiting for the OTP cooldown for ' + phone);
}

const PHONES = {
  rest: '+919876500004',     // Spice Garden, outlet 1
  rest2: '+919876500007',    // Tandoor House, outlet 2 (another tenant)
  sup1: '+919876511001',     // store 1 Sri Balaji
  sup2: '+919876511002',     // store 2 Metro Fresh
  sup3: '+919876511003',     // store 3 Deccan Wholesale
};

// ── assertion harness ──────────────────────────────────────────────────
const results = []; // {scenario, name, status: PASS|FAIL|SKIP, detail}
let current = 'S0';
const failures = [];

function setScenario(s) { current = s; console.log(`\n== ${s} ==`); }
/** Run a block of checks that are filed under another scenario (for steps that must run early but belong later). */
async function asScenario(name, fn) {
  const prev = current; current = name; console.log(`  -- (filed under ${name})`);
  try { return await fn(); } finally { current = prev; }
}
const fmt = (v) => (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));

function record(status, name, detail) {
  results.push({ scenario: current, name, status, detail });
  if (status === 'PASS') console.log(`  PASS  ${name}`);
  else if (status === 'FAIL') { console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); failures.push({ scenario: current, name, detail }); }
  else console.log(`  SKIP  ${name}${detail ? ' (' + detail + ')' : ''}`);
}

const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));
function same(actual, expected) {
  if (isNum(actual) && isNum(expected) && (typeof expected === 'number' || typeof actual === 'number')) {
    return Math.abs(Number(actual) - Number(expected)) < 0.005;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}
/** Equality; numbers compare to the paisa. */
function eq(name, actual, expected) {
  if (same(actual, expected)) record('PASS', name);
  else record('FAIL', name, `expected ${fmt(expected)}  actual ${fmt(actual)}`);
  return same(actual, expected);
}
function ok(name, cond, detail) {
  if (cond) record('PASS', name); else record('FAIL', name, detail || 'condition false');
  return !!cond;
}
function contains(name, text, needle) {
  const good = typeof text === 'string' && text.includes(needle);
  if (good) record('PASS', name); else record('FAIL', name, `expected text containing ${fmt(needle)}  actual ${fmt(text)}`);
  return good;
}
const skip = (name, why) => record('SKIP', name, why);
/** The call must have this status (and error code, when given). */
function expectStatus(name, res, status, code) {
  const okStatus = Array.isArray(status) ? status.includes(res.status) : res.status === status;
  const okCode = code === undefined || res.error?.code === code;
  if (okStatus && okCode) { record('PASS', name); return true; }
  record('FAIL', name, `expected HTTP ${fmt(status)}${code ? ' ' + code : ''}  actual HTTP ${res.status} ${res.error?.code || ''} ${res.error?.message ? '"' + res.error.message + '"' : ''}`);
  return false;
}

/** Run a scenario body; an exception is recorded as a failed step rather than aborting the run. */
async function scenario(name, fn) {
  setScenario(name);
  try { await fn(); } catch (e) { record('FAIL', 'scenario aborted: ' + (e.message || e), (e.stack || '').split('\n').slice(1, 3).join(' | ')); }
}

function summary() {
  const by = {};
  for (const r of results) {
    by[r.scenario] = by[r.scenario] || { PASS: 0, FAIL: 0, SKIP: 0 };
    by[r.scenario][r.status]++;
  }
  console.log('\n================ SUMMARY ================');
  console.log('scenario'.padEnd(30) + 'passed'.padStart(8) + 'failed'.padStart(8) + 'skipped'.padStart(9));
  let p = 0; let f = 0; let s = 0;
  for (const k of Object.keys(by).sort()) {
    const v = by[k]; p += v.PASS; f += v.FAIL; s += v.SKIP;
    console.log(k.padEnd(30) + String(v.PASS).padStart(8) + String(v.FAIL).padStart(8) + String(v.SKIP).padStart(9));
  }
  console.log('total'.padEnd(30) + String(p).padStart(8) + String(f).padStart(8) + String(s).padStart(9));
  if (failures.length) {
    console.log('\nFAILURES');
    for (const x of failures) console.log(` [${x.scenario}] ${x.name}\n     ${x.detail || ''}`);
  }
  const skips = results.filter((r) => r.status === 'SKIP');
  if (skips.length) {
    console.log('\nSKIPPED');
    for (const x of skips) console.log(` [${x.scenario}] ${x.name}: ${x.detail || ''}`);
  }
  return f;
}

const money = (n) => Math.round(Number(n) * 100) / 100;
const sum = (xs) => money(xs.reduce((a, b) => a + Number(b), 0));

async function until(fn, { timeout = 30000, every = 1000 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

module.exports = {
  API, RUN, PHONES, asScenario, api, login, db, dbVal, dbNum, sleep, uuid, key, setScenario, scenario, record, eq, ok, contains,
  skip, expectStatus, summary, money, sum, until, results, failures,
};
