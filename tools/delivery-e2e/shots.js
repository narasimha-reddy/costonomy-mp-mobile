#!/usr/bin/env node
/* Screenshots of tracking screens, per audience, through raw Chrome DevTools Protocol (no npm installs).
 * usage: node shots.js spec.json   (spec is {web, out, tokens:{aud:{accessToken,refreshToken}}, shots:[{aud,path,name,expect,forbid,waitMs}]})
 * prints one JSON line: {results:[...], tokens:{aud:{accessToken,refreshToken}}}. Tokens are never logged elsewhere. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const WEB = spec.web || 'http://localhost:7071';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(250); }
  }
  if (!version) { chrome.kill(); throw new Error('chrome did not start'); }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const evaluate = async (sessionId, expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    return r.result.value;
  };

  const sessions = {}; // aud -> {sessionId, ctx}
  async function audience(aud) {
    if (sessions[aud]) return sessions[aud];
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true }, sessionId);
    await send('Page.navigate', { url: WEB + '/welcome' }, sessionId);
    await sleep(2500);
    const t = spec.tokens[aud];
    await evaluate(sessionId, `localStorage.setItem('mp.accessToken', ${JSON.stringify(t.accessToken)}); localStorage.setItem('mp.refreshToken', ${JSON.stringify(t.refreshToken)}); 1`);
    return (sessions[aud] = { sessionId, browserContextId });
  }

  const results = [];
  fs.mkdirSync(spec.out, { recursive: true });
  for (const s of spec.shots) {
    const { sessionId } = await audience(s.aud);
    await send('Page.navigate', { url: WEB + s.path }, sessionId);
    const expect = s.expect || []; const forbid = s.forbid || [];
    const t0 = Date.now(); let text = '';
    // Wait for every expected string, or time out and report what is there.
    while (Date.now() - t0 < (s.waitMs || 20000)) {
      text = (await evaluate(sessionId, 'document.body ? document.body.innerText : ""')) || '';
      if (expect.every((e) => text.includes(e))) break;
      await sleep(500);
    }
    await sleep(s.settleMs || 1200); // animation, map tiles
    text = (await evaluate(sessionId, 'document.body ? document.body.innerText : ""')) || '';
    const png = path.join(spec.out, `${s.name}.png`);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(path.join(spec.out, `${s.name}.txt`), text);
    const missing = expect.filter((e) => !text.includes(e));
    const present = forbid.filter((f) => text.includes(f));
    results.push({ name: s.name, aud: s.aud, path: s.path, png, missing, forbiddenPresent: present,
      ok: missing.length === 0 && present.length === 0, text: text.replace(/\s+/g, ' ').slice(0, 700) });
  }
  const tokens = {};
  for (const [aud, { sessionId }] of Object.entries(sessions)) {
    tokens[aud] = {
      accessToken: await evaluate(sessionId, "localStorage.getItem('mp.accessToken')"),
      refreshToken: await evaluate(sessionId, "localStorage.getItem('mp.refreshToken')"),
    };
  }
  console.log(JSON.stringify({ results, tokens }));
  try { await send('Browser.close'); } catch { /* closing */ }
  chrome.kill();
  await sleep(800);
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp dir, harmless */ }
  process.exit(0);
}
main().catch((e) => { console.error('shots.js failed:', e.message); process.exit(1); });
