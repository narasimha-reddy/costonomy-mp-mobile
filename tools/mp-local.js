/* global __dirname */
// Shared by the end-to-end tools: the settings the local costonomy-mp-api runs with (its git-ignored .env.local) and
// sign-in, which is costonomy-common-api's (phone + code as the mp-mobile client; the dev profile's code is 123456).
// Nothing read here is printed, logged or written anywhere.
const fs = require('fs');
const path = require('path');

const COMMON = (process.env.COMMON || 'http://localhost:8082') + '/costonomy-common-api';
const CLIENT_ID = 'mp-mobile';
const OTP = process.env.OTP || '123456';

/** costonomy-mp-api's checkout: API_REPO, else beside this repo, else the usual place under ~/Documents. */
function apiRepo() {
  return [process.env.API_REPO, path.resolve(__dirname, '../../costonomy-mp-api'),
    path.join(process.env.HOME || '', 'Documents/costonomy-mp/costonomy-mp-api')]
    .filter(Boolean)
    .find((d) => fs.existsSync(`${d}/.env.local`))
    || path.resolve(__dirname, '../../costonomy-mp-api');
}

/** KEY=VALUE pairs of the API's .env.local (an empty object when it is missing). */
function apiSettings() {
  let text = '';
  try { text = fs.readFileSync(`${apiRepo()}/.env.local`, 'utf8'); } catch { /* missing: callers fall back */ }
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** The database the local API uses: process env first, then .env.local. The password is for the env only. */
function database() {
  const s = { ...apiSettings(), ...process.env };
  return { host: s.MYSQL_HOST || '127.0.0.1', port: s.MYSQL_PORT || '3306', user: s.MYSQL_USER || '',
    password: s.MYSQL_PASSWORD || '', name: s.MP_DB || 'costonomy_mp' };
}

async function common(pathname, body) {
  const res = await fetch(COMMON + pathname, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, data: json, error: json?.error };
}

/** GET from costonomy-common-api with a user's token: {status, data, error}. Businesses, outlets and stores live there (D-208). */
async function commonGet(pathname, token) {
  const res = await fetch(COMMON + pathname, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, data: json, error: json?.error };
}

/** New tokens from a refresh token (common rotates it: keep the new one), or null when it is refused. */
async function refresh(refreshToken) {
  const r = await common('/v1/auth/refresh', { refreshToken, clientId: CLIENT_ID });
  return r.status === 200 ? r.data : null;
}

/** Signs a phone in at common-api, waiting out a send cooldown. Answers {accessToken, refreshToken, expiresIn}. */
async function signIn(phone) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 6; attempt++) {
    const sent = await common('/v1/auth/otp/send', { channel: 'SMS', target: phone, purpose: 'LOGIN', clientId: CLIENT_ID });
    if (sent.status === 429) {
      const wait = (sent.error?.details?.retryAfterSeconds ?? 60) + 1;
      console.log(`    (waiting ${wait}s for ${phone}'s code cooldown)`);
      await sleep(wait * 1000);
      continue;
    }
    if (sent.status >= 400) throw new Error(`code request failed for ${phone}: ${sent.status} ${sent.error?.code}`);
    const v = await common('/v1/auth/otp/verify', { challengeId: sent.data.challengeId, code: OTP, clientId: CLIENT_ID });
    if (v.status !== 200) throw new Error(`sign-in failed for ${phone}: ${v.status} ${v.error?.code}`);
    return v.data;
  }
  throw new Error('sign-in: gave up waiting for the code cooldown for ' + phone);
}

module.exports = { apiRepo, apiSettings, database, signIn, refresh, commonGet, COMMON };
