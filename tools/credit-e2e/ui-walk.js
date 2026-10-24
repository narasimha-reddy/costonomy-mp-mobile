/* global __dirname */
// UI walkthrough of every restaurant Credit screen (plus the supplier's Credit tab) in a real browser at phone size.
// Chrome DevTools Protocol over `ws`, driven by TAPPING; after every step: screenshot + automatic layout checks
// (overlap, clipping, tap targets, console/network, raw codes, bottom-bar clearance). LOCAL ONLY. See README.md.
//
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9444 \
//       --user-data-dir=<fresh dir> --window-size=390,844 about:blank &
//   node tools/credit-e2e/ui-walk.js            # all sections;  ONLY=3,4 to select;  VIEWS=0 to skip 360/412 re-runs
const fs = require('fs');
const path = require('path');
const { Browser, pageCheck, pageClearance, sleep } = require('./ui-core');
const lib = require('./lib');

const WEB = process.env.WEB || 'http://localhost:7072';
const PORT = Number(process.env.CDP_PORT || 9444);
const SHOTS = process.env.SHOTS || path.resolve(__dirname, '../../../ui-shots');
const REST = '+919876500004';
const SUP = '+919876511001';
if (!/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(WEB)) throw new Error('Refusing: WEB must be local, got ' + WEB);
fs.mkdirSync(SHOTS, { recursive: true });

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
const texts = {};
if (process.env.ONLY && process.argv[2] !== '--report') {
  // a subset run keeps the other steps' earlier results and texts
  try { for (const r of JSON.parse(fs.readFileSync(path.join(SHOTS, 'results.json'), 'utf8'))) results.push(r); Object.assign(texts, JSON.parse(fs.readFileSync(path.join(SHOTS, 'texts.json'), 'utf8'))); } catch { /* first run */ }
}
const seenToast = new Set();
const seenLogs = new Set();
let view = [390, 844];
let b;
let cur; // current step context

const money = (s) => { const m = String(s).match(/-?₹\s*([\d,]+(?:\.\d+)?)/); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
const moneys = (s) => [...String(s).matchAll(/₹\s*([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));

// ── driver primitives ────────────────────────────────────────────────────────────────────────────────────────
async function tap(spec, { optional = false, settle = true } = {}) {
  if (typeof spec === 'string') spec = { text: spec };
  let f = await b.find(spec);
  for (let i = 0; i < 8 && !f.found; i++) { await sleep(400); f = await b.find(spec); }
  if (!f.found) {
    if (optional) return null;
    throw new Error(`element not found: ${JSON.stringify(spec)}`);
  }
  if (f.blocked) cur?.fails.push(`TAP BLOCKED: ${JSON.stringify(spec)} at (${Math.round(f.x)},${Math.round(f.y)}) is covered by ${f.blocker}`);
  await b.mouse(f.x, f.y);
  if (settle) { await sleep(250); await b.settle(); }
  return f;
}
async function has(spec) { if (typeof spec === 'string') spec = { text: spec }; const f = await b.find({ ...spec, noScroll: true }); return f.found ? f : null; }
async function waitFor(spec, ms = 10000) {
  if (typeof spec === 'string') spec = { text: spec };
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const f = await b.find({ ...spec, noScroll: true }); if (f.found) return f; await sleep(300); }
  throw new Error(`timed out waiting for ${JSON.stringify(spec)}`);
}
async function typeInto(spec, value) {
  // focus from the page rather than by a click: a click on the field is checked on its own (see section 6)
  if (typeof spec === 'string') spec = { text: spec };
  const f = await b.find(spec);
  if (!f.found) throw new Error(`field not found: ${JSON.stringify(spec)}`);
  await b.ev(`(()=>{const l=${JSON.stringify(spec.css || (spec.placeholder ? `input[placeholder="${spec.placeholder}"]` : `[data-testid="${spec.testid}"]`))};const e=document.querySelector(l);if(e){e.focus();e.select&&e.select()}})()`);
  if (value === '') { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); }
  else await b.send('Input.insertText', { text: value });
  await sleep(300);
  return f;
}
const bodyText = () => b.ev(`(()=>{const g=new Map();const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let n=tw.nextNode();n;n=tw.nextNode()){if(!n.nodeValue.trim())continue;let ok=true;for(let p=n.parentElement;p&&p!==document.documentElement;p=p.parentElement){const cs=getComputedStyle(p);if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0'||p.getAttribute('aria-hidden')==='true'){ok=false;break}}if(ok)g.set(n.parentElement,(g.get(n.parentElement)||'')+n.nodeValue)}return [...g.values()].map(v=>v.replace(/\\s+/g,' ').trim()).filter(Boolean).join('\\n')})()`);
const testText = (id) => b.ev(`(()=>{const e=document.querySelector('[data-testid="${id}"]');return e?e.innerText:null})()`);
const scrollTop = () => b.ev(`(()=>{for(const e of document.querySelectorAll('div')){const c=getComputedStyle(e);if((c.overflowY==='auto'||c.overflowY==='scroll')&&e.scrollTop>0)e.scrollTop=0}return 1})()`);
const A = (cond, msg) => { if (!cond) cur.fails.push(`ASSERT: ${msg}`); else cur.passes.push(msg); return !!cond; };
const note = (msg) => cur.notes.push(msg);
const note0 = (msg) => console.log('   . ' + msg);

const HIDE_TOAST = `(()=>{const t=document.getElementById('error-toast');const x=t?t.innerText:'';
  if(!document.getElementById('walk-hide')){const s=document.createElement('style');s.id='walk-hide';s.textContent='#error-toast{opacity:0!important;pointer-events:none!important}';document.head.appendChild(s)}return x})()`;

/**
 * One screenshot + one set of checks. `act` performs the taps; opts: clearance, expectNet (codes/paths allowed to fail),
 * skipChecks, keepTop.
 */
async function step(name, title, act, opts = {}) {
  const suffix = view[0] === 390 ? '' : `@${view[0]}`;
  const id = `${name}${suffix}`;
  cur = { id, title, view: view.join('x'), fails: [], passes: [], notes: [], checks: {} };
  b.reset();
  try { if (act) await act(); } catch (e) { cur.fails.push(`DRIVER: ${e.message}`); }
  await sleep(600); await b.settle();
  const toast = await b.ev(HIDE_TOAST);
  if (toast) for (const l of toast.split('\n').filter((x) => x.length > 12 && !/^\d+$/.test(x))) { if (!seenToast.has(l)) { seenToast.add(l); cur.notes.push(`dev console toast: ${l.slice(0, 160)}`); } }
  let res = null;
  try {
    res = await b.fn(pageCheck, {});
    await b.shot(path.join(SHOTS, `${id}.png`));
  } catch (e) { cur.fails.push(`DRIVER: checks failed: ${e.message}`); }
  if (res) {
    const c = cur.checks;
    c.overlap = { status: res.overlap.length + res.occluded.length ? 'FAIL' : 'PASS', items: [...res.overlap, ...res.occluded.map((x) => `covered: ${x}`)] };
    c.clipping = { status: res.hscroll.length + res.textOutside.length ? 'FAIL' : res.truncated.length ? 'WARN' : 'PASS', items: [...res.hscroll, ...res.textOutside, ...res.truncated.map((x) => `truncated: ${x}`)] };
    c.tapTargets = { status: res.small.length ? 'WARN' : 'PASS', items: res.small };
    c.raw = { status: res.raw.length ? 'FAIL' : 'PASS', items: res.raw };
    const rawLogs = [...new Set(b.logs)].filter((l) => !/Download the React DevTools|favicon/.test(l));
    const logs = [];
    for (const l of rawLogs) {
      if (/realtime\/socket/.test(l)) { if (!seenLogs.has('rt')) { seenLogs.add('rt'); cur.notes.push('environment: realtime WebSocket handshake to /realtime/socket fails on every page (dev server answers instead of the API); not Credit related'); } continue; }
      const key = l.replace(/ticket=\S+/, '').slice(0, 60) + l.slice(-60);
      if (seenLogs.has(key)) continue;
      seenLogs.add(key); logs.push(l);
    }
    const expectNet = opts.expectNet || [];
    const nets = b.netFails.filter((n) => !expectNet.some((e) => n.code === e || n.path.includes(e) || String(n.status) === String(e)));
    const expected = b.netFails.filter((n) => !nets.includes(n));
    c.console = { status: logs.length || nets.length ? 'FAIL' : 'PASS',
      items: [...logs, ...nets.map((n) => `${n.status} ${n.method} ${n.path} ${n.code}`), ...expected.map((n) => `(expected) ${n.status} ${n.method} ${n.path} ${n.code}`)] };
    texts[id] = { title, path: res.path, inModal: res.inModal, text: res.text.split('\n').map((s) => s.trim()).filter(Boolean) };
    cur.res = { nInteractive: res.nInteractive, nTexts: res.nTexts, path: res.path, inModal: res.inModal };
  }
  if (opts.clearance && !(res && res.inModal)) {
    const cl = await b.fn(pageClearance, {});
    if (cl.scroller) {
      cur.checks.clearance = { status: cl.gap < 0 ? 'FAIL' : cl.gap < 8 ? 'WARN' : 'PASS',
        items: [`${cl.bar ? 'sticky bar' : 'no sticky bar'}; scrolled to end (atEnd=${cl.atEnd}); last content "${cl.lastText}" bottom=${cl.lastBottom}${cl.bar ? `, bar top=${cl.barTop}` : `, scroller bottom=${cl.scrollerBottom}`}; gap=${cl.gap}px`] };
      await sleep(250);
      await b.shot(path.join(SHOTS, `${id}-end.png`));
      await scrollTop();
      if (cl.gap < 0) cur.fails.push(`CLEARANCE: last item ends ${-cl.gap}px beneath the sticky bar`);
    } else cur.checks.clearance = { status: 'PASS', items: ['page does not scroll'] };
  }
  const st = [];
  for (const [k, v] of Object.entries(cur.checks)) st.push(`${k}:${v.status}`);
  const bad = Object.values(cur.checks).some((v) => v.status === 'FAIL') || cur.fails.length;
  console.log(`${bad ? 'FAIL' : Object.values(cur.checks).some((v) => v.status === 'WARN') ? 'WARN' : 'PASS'}  ${id.padEnd(34)} ${st.join(' ')}`);
  for (const f of cur.fails) console.log(`      ! ${f}`);
  for (const [k, v] of Object.entries(cur.checks)) if (v.status === 'FAIL') for (const i of v.items.slice(0, 6)) console.log(`      ${k}: ${i}`);
  const prev = results.findIndex((r) => r.id === cur.id);
  if (prev >= 0) results.splice(prev, 1, cur); else results.push(cur);
  const keep = cur; cur = null;
  fs.writeFileSync(path.join(SHOTS, 'texts.json'), JSON.stringify(texts, null, 1));
  fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results.map((r) => ({ ...r, res: undefined })), null, 1));
  return keep;
}

// ── sessions ─────────────────────────────────────────────────────────────────────────────────────────────────
const saved = {}; // the newest token pair per phone, read back from the browser: the app rotates its refresh token itself
async function saveTokens(phone) {
  const t = await b.ev(`JSON.stringify({a:localStorage.getItem('mp.accessToken'),r:localStorage.getItem('mp.refreshToken')})`).catch(() => null);
  const p = t ? JSON.parse(t) : null;
  if (p && p.a && p.r) saved[phone] = { accessToken: p.a, refreshToken: p.r };
}
/** The browser gets a session of its own (OTP 123456), so the app's refresh-token rotation cannot clash with the suite's cached tokens. */
async function freshLogin(phone) {
  for (let i = 0; i < 6; i++) {
    const req = await lib.api('/auth/otp/request', { body: { phone, purpose: 'LOGIN' } });
    if (req.status === 429 || (req.error && req.error.code === 'OTP_RESEND_TOO_SOON')) {
      const s = ((req.error && req.error.details && req.error.details.retryAfterSeconds) || 60) + 1;
      console.log(`   (waiting ${s}s for the OTP cooldown of ${phone})`);
      await sleep(s * 1000);
      continue;
    }
    if (req.status >= 400) throw new Error(`otp request failed for ${phone}: ${req.status}`);
    const v = await lib.api('/auth/otp/verify', { body: { phone, otp: '123456', purpose: 'LOGIN' } });
    if (v.status !== 200) throw new Error(`login failed for ${phone}: ${v.status}`);
    return { accessToken: v.data.accessToken, refreshToken: v.data.refreshToken };
  }
  throw new Error('login: the OTP cooldown never cleared');
}
let curPhone = null;
async function signIn(phone) {
  if (curPhone === phone) return; // the browser's localStorage already holds this session, with the tokens the app rotated itself
  if (curPhone) await saveTokens(curPhone);
  if (!saved[phone]) {
    // a session already in the browser for this phone (an earlier run) is reused: OTP requests are rate limited per hour
    await b.goto(`${WEB}/welcome`);
    await sleep(1500);
    const have = await b.ev(`(()=>{const a=localStorage.getItem('mp.accessToken'),r=localStorage.getItem('mp.refreshToken');if(!a||!r)return null;try{const p=JSON.parse(atob(a.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return JSON.stringify({a,r,phone:p.phone})}catch(e){return null}})()`);
    const h = have ? JSON.parse(have) : null;
    if (h && h.phone === phone) { saved[phone] = { accessToken: h.a, refreshToken: h.r }; curPhone = phone; return; }
    saved[phone] = await freshLogin(phone);
  }
  const c = saved[phone];
  await b.goto(`${WEB}/welcome`);
  await sleep(2500);
  await b.ev(`localStorage.clear();localStorage.setItem('mp.accessToken',${JSON.stringify(c.accessToken)});localStorage.setItem('mp.refreshToken',${JSON.stringify(c.refreshToken)});1`);
  curPhone = phone;
}
/** The access token the app itself is using right now (never refresh behind its back: that would invalidate its session). */
async function appToken() {
  const t = await b.ev(`localStorage.getItem('mp.accessToken')`);
  return t || (saved[REST] && saved[REST].accessToken) || lib.login(REST);
}
async function home() {
  await b.goto(`${WEB}/restaurant`);
  await waitFor({ testid: 'action-credit' }, 25000);
  await b.settle();
}
async function openCredit() {
  await home();
  await tap({ testid: 'action-credit' });
  await waitFor({ testid: 'credit-hero-summary' }, 15000);
  await b.settle();
}
async function openSupplierDetail(name) {
  await openCredit();
  await tap({ text: name, nth: 0 });
  await waitFor({ text: 'Statement' }, 15000);
  await b.settle();
}

// ── sections ─────────────────────────────────────────────────────────────────────────────────────────────────
const sections = [];
const section = (n, title, opts, fn) => sections.push({ n, title, ...opts, fn });
// SECTIONS
/**
 * Approximates a soft keyboard by shrinking the window to 62% of its height with the field focused. A desktop browser has no
 * keyboard, so this cannot show how a phone behaves (KeyboardAvoidingView, edge-to-edge insets), only whether the focused field
 * and the main button are still on screen, or reachable by scrolling, when the screen is that short.
 */
async function keyboardSim(name, title, fieldCss, buttonCss) {
  const h = Math.round(view[1] * 0.62);
  await step(name, title, async () => {
    await b.viewport(view[0], h);
    await sleep(700);
    await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(fieldCss)});if(e){e.focus();e.scrollIntoView({block:'nearest'})}})()`);
    await sleep(600);
    const g = JSON.parse(await b.ev(`(()=>{const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {top:Math.round(b.top),bottom:Math.round(b.bottom)}};return JSON.stringify({vh:innerHeight,field:r(${JSON.stringify(fieldCss)}),button:r(${JSON.stringify(buttonCss)})})})()`));
    note(`window ${view[0]}x${g.vh}: field ${JSON.stringify(g.field)} button ${JSON.stringify(g.button)}`);
    A(g.field != null && g.field.top >= 0 && g.field.bottom <= g.vh, `focused field is on screen when the window is only ${g.vh}px tall`);
    if (g.button) { if (!(g.button.top >= 0 && g.button.bottom <= g.vh)) note(`the main button is off screen (${JSON.stringify(g.button)}); it has to be scrolled to`); else note('main button stays on screen'); }
  });
  await b.viewport(view[0], view[1]);
  await sleep(500);
}
const api = (p, opts) => lib.api(p, opts);
const restToken = () => appToken();
const goBack = async () => { await b.ev('history.back()'); await sleep(500); await b.settle(); };
const rowAmount = (t) => moneys(t).pop();
// react-native-web does not write aria-checked for Pressable rows here, so read the tick from the icon's colour (orange = on)
const tickedRows = async () => JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('[data-testid^="multi-row-"]')].map(e=>{const ic=[...e.querySelectorAll('div')].find(d=>/ionicons/.test(d.style.fontFamily));const c=ic?getComputedStyle(ic).color.match(/\\d+/g).map(Number):[0,0,0];return {id:e.dataset.testid,label:e.getAttribute('aria-label'),on:c[0]>200&&c[2]<80}}))`));

// 1 ── Home: the Credit tile
section('1', 'Home with the Credit tile', { key: true }, async () => {
  await step('01-home', 'Home: Credit tile (third, orange disc, dot)', async () => {
    await home();
    const geo = await b.ev(`(()=>{const q=(id)=>{const e=document.querySelector('[data-testid="'+id+'"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}};
      const tile=document.querySelector('[data-testid="action-credit"]');const cs=tile?getComputedStyle(tile.querySelector('div')||tile).backgroundColor:'';
      const disc=[...document.querySelectorAll('[data-testid="action-credit"] *')].map(e=>getComputedStyle(e).backgroundColor).filter(c=>c!=='rgba(0, 0, 0, 0)');
      return JSON.stringify({q:q('money-transfers'),quick:q('action-quickscan'),wallet:q('action-wallet'),credit:q('action-credit'),dot:q('action-credit-badge'),bg:disc.slice(0,3)})})()`);
    const g = JSON.parse(geo);
    note(`tile geometry ${geo}`);
    A(g.credit && g.wallet && g.quick && g.quick.x < g.wallet.x && g.wallet.x < g.credit.x, 'Credit tile is third (after Quick Scan and Wallet)');
    const ovr = Number(((await api('/outlets/1/credit/summary', { token: await restToken() })).data || {}).overdue || 0);
    A(ovr > 0 ? !!g.dot : true, `Credit tile dot (action-credit-badge) ${ovr > 0 ? 'shown while ₹' + ovr + ' is overdue' : 'not required: nothing is overdue'} (dot present: ${!!g.dot})`);
    A(g.bg.some((c) => /255, 10[0-9], 0|25[0-5], ?9[0-9], ?0|249, 11[0-9]/.test(c)) || g.bg.length > 0, `Credit disc has a fill colour ${g.bg.join(' ')}`);
  });
});

// 2 ── Credit overview
section('2', 'Credit overview', { key: true }, async () => {
  await step('02-overview', 'Credit overview', async () => {
    await openCredit();
    const t = await bodyText();
    A(/You owe/.test(t), 'hero says "You owe"');
    const ovr = Number(((await api('/outlets/1/credit/summary', { token: await restToken() })).data || {}).overdue || 0);
    A(ovr > 0 ? /₹[\d,]+(\.\d\d)? overdue/.test(t) : !/overdue/i.test(t.split('Dues by supplier')[0]), ovr > 0 ? 'overdue line has words ("₹x overdue")' : 'no overdue line while nothing is overdue');
    A(/Sri Balaji Traders/.test(t) && /Metro Fresh Supplies/.test(t) && /Deccan Wholesale/.test(t), 'three suppliers listed');
    const sum = (await api('/outlets/1/credit/summary', { token: await restToken() })).data || {};
    const anyReported = (sum.agreements || []).some((a) => Number(a.openClaimsAmount) > 0 && Number(a.due) > 0);
    A(anyReported ? /Payment reported/.test(t) : !/Payment reported/.test(t), anyReported ? '"Payment reported" line shown' : 'no "Payment reported" line while nothing is reported');
    const geo = await b.ev(`JSON.stringify(['pay-from-wallet','i-paid'].map(id=>{const e=document.querySelector('[data-testid="'+id+'"]');if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom),Math.round(r.height)]}))`);
    note(`hero buttons [top,bottom,height]: ${geo}`);
    const gap = await b.ev(`(()=>{const btn=document.querySelector('[data-testid="pay-from-wallet"]');if(!btn)return null;const top=btn.getBoundingClientRect().top;let best=-1;const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let n=tw.nextNode();n;n=tw.nextNode()){if(!n.nodeValue.trim())continue;const r=document.createRange();r.selectNodeContents(n);const b=r.getBoundingClientRect();if(b.height&&b.bottom<=top+1&&b.bottom>best&&b.top>top-120)best=b.bottom}return Math.round(top-best)})()`);
    note(`gap between the last text above and the Pay button: ${gap}px`);
    A(gap == null || gap >= 8, `text above the Pay from wallet button is at least 8px clear of it (gap ${gap}px)`);
  }, { clearance: true });
});

// 3 ── Pay from wallet sheet (nothing is paid here)
section('3', 'Pay overdue sheet (toggle, picker)', { key: true }, async () => {
  await step('03-pay-sheet', 'Pay overdue to: sheet', async () => {
    await openCredit();
    await tap({ testid: 'pay-from-wallet' });
    await waitFor({ text: 'Pay overdue to' });
    const rows = await tickedRows();
    note(`rows: ${rows.map((r) => `${r.label} ticked=${r.on}`).join(' | ')}`);
    A(rows.length >= 2, `sheet lists ${rows.length} suppliers`);
    const total = money(await testText('multi-total'));
    const sum = rows.filter((r) => r.on).reduce((a, r) => a + rowAmount(r.label), 0);
    A(Math.abs(total - sum) < 0.005, `total ${total} equals the sum of the ticked rows ${sum}`);
    A(rows.filter((r) => r.on).every((r) => /overdue/.test(r.label) && !/not overdue/.test(r.label)), 'only overdue suppliers are ticked by default');
    A(rows.filter((r) => /not overdue/.test(r.label)).every((r) => !r.on), 'a supplier that is not overdue starts unticked');
    A(/Wallet ₹/.test(await testText('multi-wallet') || ''), 'wallet balance line present');
  });
  await step('03-pay-sheet-toggled', 'Pay overdue to: row toggled', async () => {
    const before = money(await testText('multi-total'));
    await tap({ testidPrefix: 'multi-row-', nth: 0 });
    await sleep(300);
    const after = money(await testText('multi-total'));
    A(after !== before, `untick first row changes total (${before} -> ${after})`);
    const btn = await b.find({ testid: 'multi-pay', noScroll: true });
    note(`Pay button after toggle: "${btn.text}" disabled=${btn.disabled}`);
    await tap({ testidPrefix: 'multi-row-', nth: 0 });
    await sleep(300);
    A(money(await testText('multi-total')) === before, 'ticking it again restores the total');
    // untick everything: the Pay button must be disabled and the total zero
    for (const r of await tickedRows()) if (r.on) { await tap({ testid: r.id }, { settle: false }); await sleep(200); }
    await sleep(300);
    const none = await b.find({ testid: 'multi-pay', noScroll: true });
    A(none.disabled === true, `Pay button disabled when nothing is ticked ("${none.text}")`);
    A(money(await testText('multi-total')) === 0, `total is 0 when nothing is ticked (${await testText('multi-total')})`);
    for (const r of await tickedRows()) if (/overdue/.test(r.label) && !/not overdue/.test(r.label) && !r.on) { await tap({ testid: r.id }, { settle: false }); await sleep(200); }
    await sleep(300);
  });
  await step('03-pay-picker', 'Pay which supplier? (picker)', async () => {
    await tap({ testid: 'multi-one-instead' });
    await waitFor({ text: 'Pay which supplier?' });
  });
  await step('03-pay-picker-closed', 'Picker closed, back on the overview', async () => {
    await tap({ label: 'Close', exact: false });
    await sleep(500);
    A(!(await has({ text: 'Pay which supplier?' })), 'picker closed');
    A(!!(await has({ testid: 'credit-hero-summary' })), 'overview is still showing');
  });
});

// 4 ── supplier detail screens
for (const [i, name] of [['4a', 'Sri Balaji Traders'], ['4b', 'Metro Fresh Supplies'], ['4c', 'Deccan Wholesale']]) {
  section(i, `Supplier detail: ${name}`, { key: i === '4a' }, async () => {
    const tag = i.replace('4', 'sup-');
    await step(`04${i.slice(1)}-${name.split(' ')[0].toLowerCase()}-open`, `${name}: summary and Open invoices`, async () => { await openSupplierDetail(name); }, { clearance: true });
    await step(`04${i.slice(1)}-${name.split(' ')[0].toLowerCase()}-paid`, `${name}: Paid tab`, async () => {
      await tap({ testid: 'credit-tab-paid' });
      const t = await bodyText();
      note(`paid tab: ${/No paid invoices yet/.test(t) ? 'empty state' : 'has rows'}`);
    }, { clearance: true });
    await step(`04${i.slice(1)}-${name.split(' ')[0].toLowerCase()}-statement-row`, `${name}: Statement row`, async () => {
      await tap({ testid: 'credit-tab-open' });
      A(!!(await has({ text: 'Statement' })) || !!(await has({ testid: 'credit-statement-row' })), 'Statement row present');
      await scrollTop();
    });
    void tag;
  });
}

// ── helpers for 5..8 ─────────────────────────────────────────────────────────────────────────────────────────
async function invoiceIdsOnPage() {
  return JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('[data-testid^="credit-invoice-"]')].map(e=>e.dataset.testid).filter(t=>/^credit-invoice-\\d+$/.test(t)).map(t=>Number(t.split('-').pop())))`));
}
const field = (id) => ({ css: `input[data-testid="${id}"],[data-testid="${id}"] input,[data-testid="${id}"] textarea,textarea[data-testid="${id}"]` });
const fieldValue = (id) => b.ev(`(()=>{const e=document.querySelector('input[data-testid="${id}"],[data-testid="${id}"] input,[data-testid="${id}"] textarea,textarea[data-testid="${id}"]');return e?e.value:null})()`);
async function invoiceApi(id) { const r = await api(`/credit/invoices/${id}`, { token: await restToken() }); return r.data; }
const NAMES = { 1: 'Sri Balaji Traders', 3: 'Metro Fresh Supplies', 4: 'Deccan Wholesale' };
let pickedInv = null; // what exists right now: other testers and earlier runs change the data, so nothing is hard-coded
async function pickInvoices() {
  if (pickedInv) return pickedInv;
  const t = await restToken();
  const out = { open: null, reports: null, plain: null, paid: null, wallet: null };
  for (const aid of [1, 3, 4]) {
    const list = (await api(`/credit/agreements/${aid}/invoices`, { token: t })).data || [];
    for (const inv of list) {
      const d = (await api(`/credit/invoices/${inv.id}`, { token: t })).data;
      if (!d) continue;
      const owed = Number(d.outstanding) > 0;
      const waiting = (d.claims || []).filter((c) => c.status === 'SUBMITTED').length;
      if (!owed && !out.paid) out.paid = { id: inv.id, aid };
      if (!out.wallet && (d.payments || []).some((p) => p.source === 'WALLET')) out.wallet = { id: inv.id, aid };
      if ((d.claims || []).length > 0 && (!out.reports || (owed && !out.reports.owed))) out.reports = { id: inv.id, aid, owed, number: d.invoiceNumber, reportable: d.reportableAmount, waiting };
      if (!owed) continue;
      if (!out.open) out.open = { id: inv.id, aid };
      if (Number(d.reportableAmount) >= 5 && (!out.plain || (waiting === 0 && out.plain.waiting > 0))) out.plain = { id: inv.id, aid, number: d.invoiceNumber, reportable: d.reportableAmount, waiting };
    }
  }
  pickedInv = out;
  return out;
}
const gotoInvoice = async (id) => { await b.goto(`${WEB}/restaurant/credit/invoice/${id}`); await waitFor({ text: 'Invoice amount' }, 25000); await b.settle(); };

// 5 ── invoice detail
section('5', 'Invoice detail', { key: true }, async () => {
  const inv = await pickInvoices();
  note0(`picked invoices ${JSON.stringify(inv)}`);
  if (inv.open) {
    await step('05-invoice-open', 'Invoice detail (open invoice, reached by tapping the row)', async () => {
      await openSupplierDetail(NAMES[inv.open.aid]);
      const ids = await invoiceIdsOnPage();
      A(ids.length > 0, `open tab lists ${ids.length} invoices`);
      await tap({ testid: `credit-invoice-${inv.open.id}` });
      await waitFor({ text: 'Invoice amount' });
      const t = await bodyText();
      A(/Still owed/.test(t) && /Paid/.test(t), 'amounts block present');
      A(/Payments/.test(t), 'Payments section present');
      A(!!(await has({ testid: 'invoice-pay' })), 'Pay button in the sticky bar');
    }, { clearance: true });
  } else note0('no open invoice left on any line');
  if (inv.reports) {
    await step('05-invoice-reports', 'Invoice detail with "Your reports"', async () => {
      await gotoInvoice(inv.reports.id);
      A(!!(await has({ text: 'Your reports' })), '"Your reports" section shown');
      if (inv.reports.waiting > 0) A(!!(await has({ text: 'Withdraw' })), 'Withdraw button present on a waiting report');
    }, { clearance: true });
  } else note0('no invoice with a report found');
  if (inv.wallet) await step('05-invoice-wallet-payments', 'Invoice detail with payments made from the wallet', async () => {
    await gotoInvoice(inv.wallet.id);
    const t = await bodyText();
    A(/From wallet/.test(t), 'a wallet payment row is shown');
    A(!/\bWALLET\b|credit-repayment-\d+/.test(t), 'no raw "WALLET" / "credit-repayment-N" text in the payment rows');
  }, { clearance: true });
  if (inv.paid) await step('05-invoice-paid', 'Invoice detail (paid invoice)', async () => { await gotoInvoice(inv.paid.id); }, { clearance: true });
});

// 6 ── single-invoice pay sheet
section('6', 'Single-invoice Pay sheet (nothing paid)', { key: true }, async () => {
  const inv = await pickInvoices();
  if (!(inv.plain || inv.open)) { note0('no open invoice left: nothing to pay-sheet test'); return; }
  const id = (inv.plain || inv.open).id;
  const d = await invoiceApi(id);
  await step('06-pay-sheet', 'Invoice Pay sheet: choices', async () => {
    await gotoInvoice(id);
    await tap({ testid: 'invoice-pay' });
    await waitFor({ testid: 'pay-button' });
    A(!!(await has({ text: 'Other amount' })), '"Other amount" choice offered');
    const wb = await testText('wallet-balance');
    A(/Wallet balance ₹/.test(wb || ''), `wallet balance line (${wb})`);
  });
  await step('06-sheet-tap-text', 'Tapping plain text inside the sheet', async () => {
    await tap({ testid: 'wallet-balance' });
    await sleep(500);
    const still = !!(await has({ testid: 'pay-button' }));
    if (!still) { cur.fails.push('WEB: tapping plain text inside the Pay sheet closes it (any tap that is not on a button reaches the scrim); reopening to carry on'); await tap({ testid: 'invoice-pay' }); await waitFor({ testid: 'pay-button' }); }
  });
  await step('06-pay-other-empty', 'Other amount: empty', async () => {
    await tap({ testid: 'choice-other' });
    const open = async () => !!(await has({ testid: 'pay-button' }));
    await tap(field('other-amount'));
    await sleep(500);
    if (!(await open())) {
      cur.fails.push('WEB: a real click on the Amount field closes the Pay sheet (the scrim receives the click); reopening it to carry on');
      await tap({ testid: 'invoice-pay' }); await waitFor({ testid: 'pay-button' }); await tap({ testid: 'choice-other' });
    }
    const pb = await b.find({ testid: 'pay-button', noScroll: true });
    A(pb.disabled === true, `Pay disabled with no amount ("${pb.text}")`);
  });
  const trials = [['0.5', 'Enter at least ₹1.00.', true], ['1.005', 'Use at most 2 decimal places.', true], ['abc', null, true], ['1', null, false], [String(Number(d.outstanding) + 100), null, false]];
  for (const [val, msg, disabled] of trials) {
    await step(`06-pay-other-${val.replace(/[^\w]/g, '_')}`, `Other amount: "${val}"`, async () => {
      await typeInto(field('other-amount'), val);
      const shown = await fieldValue('other-amount');
      const t = await bodyText();
      const pb = await b.find({ testid: 'pay-button', noScroll: true });
      note(`field shows "${shown}", button "${pb.text}" disabled=${pb.disabled}`);
      if (msg) A(t.includes(msg), `message "${msg}" shown`);
      if (val === 'abc') A(shown === '', 'letters are not accepted into the amount field');
      A((pb.disabled === true) === disabled, `Pay button ${disabled ? 'disabled' : 'enabled'}`);
      if (!msg && !disabled) A(!/at least|decimal/.test(t), 'no validation message for a valid amount');
    });
  }
  await keyboardSim('06-kbd-sim-pay-sheet', 'Pay sheet with a short window (soft keyboard approximation)', 'input[data-testid=other-amount]', '[data-testid=pay-button]');
  await step('06-pay-sheet-closed', 'Sheet closed without paying', async () => {
    await tap({ label: 'Close', exact: false });
    await sleep(500);
    A(!(await has({ testid: 'pay-button' })), 'sheet closed');
    const d2 = await invoiceApi(id);
    A(d2.outstanding === d.outstanding || Number(d2.outstanding) === Number(d.outstanding), 'outstanding unchanged (nothing was paid)');
  });
});

// 7 ── "I paid outside the app"
section('7', 'I paid outside the app (report, duplicate, withdraw)', { key: false }, async () => {
  const inv = await pickInvoices();
  const target = inv.plain || inv.open;
  if (!target) { note0('no open invoice left: nothing to report'); return; }
  const before = await invoiceApi(target.id);
  const reportable = Number(before.reportableAmount);
  const waitingBefore = (before.claims || []).filter((c) => c.status === 'SUBMITTED').reduce((a, c) => a + Number(c.amount), 0);
  let sentId = null;
  if (inv.reports && Number(inv.reports.reportable) === 0) {
    await step('07-claim-all-reported', 'Report form when everything is already reported', async () => {
      await gotoInvoice(inv.reports.id);
      const hasBtn = await has({ testid: 'invoice-i-paid' });
      note(`invoice ${inv.reports.number}: "I paid outside the app" button present=${!!hasBtn}`);
      if (hasBtn) { await tap({ testid: 'invoice-i-paid' }); await waitFor({ testid: 'claim-send' }); A(!!(await has({ testid: 'claim-all-reported' })), 'all-reported message shown'); const s = await b.find({ testid: 'claim-send', noScroll: true }); A(s.disabled === true, 'Send disabled when everything is reported'); }
      else A(true, 'no report button when everything is already reported');
    }, { clearance: true });
  }
  await step('07-claim-form', 'Report form (prefilled)', async () => {
    await gotoInvoice(target.id);
    await tap({ testid: 'invoice-i-paid' });
    await waitFor({ testid: 'claim-send' });
    const v = await fieldValue('claim-amount');
    A(Number(v) === reportable, `prefilled amount ${v} equals the server's reportable amount ${reportable}`);
    if (waitingBefore > 0) A(!!(await has({ testid: 'claim-waiting-info' })), `"already reported and waiting" line shown (${waitingBefore} waiting)`);
    else A(!(await has({ testid: 'claim-waiting-info' })), 'no waiting line when nothing is waiting');
    const refReq = await has({ testid: 'claim-method-BANK_TRANSFER' });
    const send = await b.find({ testid: 'claim-send', noScroll: true });
    note(`default method chips present=${!!refReq}; reference empty -> Send disabled=${send.disabled} ("${send.text}")`);
    A(send.disabled === true, 'Send is disabled while the reference is empty (bank transfer)');
  }, { clearance: true });
  await keyboardSim('07-kbd-sim-claim', 'Report form with a short window (soft keyboard approximation)', '[data-testid=claim-reference] input,input[data-testid=claim-reference]', '[data-testid=claim-send]');
  await step('07-claim-date', 'Date stepper cannot pass today', async () => {
    const next = await b.find({ testid: 'claim-date-next', noScroll: true });
    A(next.disabled === true, 'Next day is disabled on today');
    const prevBtn = await b.find({ testid: 'claim-date-prev', noScroll: true });
    if (prevBtn.disabled) note('Previous day is disabled: the invoice was issued today, so the date cannot go before the issue date');
    else {
      await tap({ testid: 'claim-date-prev' });
      const prev = await testText('claim-date-text');
      const next2 = await b.find({ testid: 'claim-date-next', noScroll: true });
      A(next2.disabled === false, `Next day enabled after stepping back (${prev})`);
      await tap({ testid: 'claim-date-next' });
      const next3 = await b.find({ testid: 'claim-date-next', noScroll: true });
      A(next3.disabled === true, 'Next day disabled again on today (cannot go into the future)');
    }
  });
  await step('07-claim-cash', 'Cash selected: reference optional', async () => {
    await tap({ testid: 'claim-method-CASH' });
    await typeInto(field('claim-amount'), '1');
    const send = await b.find({ testid: 'claim-send', noScroll: true });
    A(send.disabled === false, `Send enabled for Cash without a reference ("${send.text}")`);
    A(/Optional for cash/.test(await bodyText()), '"Optional for cash" hint shown');
  });
  await step('07-claim-sent', 'Cash report sent', async () => {
    await tap({ testid: 'claim-send' });
    await sleep(1500);
    await waitFor({ text: 'Invoice amount' }, 15000);
    const d = await invoiceApi(target.id);
    const mine = (d.claims || []).filter((c) => c.status === 'SUBMITTED' && Number(c.amount) === 1 && c.method === 'CASH');
    A(mine.length >= 1, 'a SUBMITTED cash report of 1.00 exists on the invoice');
    if (mine.length) sentId = mine[mine.length - 1].id;
    A(!!(await has({ text: 'Your reports' })), '"Your reports" shows on the invoice');
  });
  await step('07-claim-duplicate', 'Identical report: duplicate warning and "Send anyway"', async () => {
    await tap({ testid: 'invoice-i-paid' });
    await waitFor({ testid: 'claim-send' });
    await tap({ testid: 'claim-method-CASH' });
    await typeInto(field('claim-amount'), '1');
    await sleep(300);
    A(!!(await has({ testid: 'claim-duplicate-warning' })), 'duplicate warning shown');
    A(!!(await has({ testid: 'claim-waiting-info' })), '"already reported and waiting" line shown now that a report is waiting');
    const send = await b.find({ testid: 'claim-send', noScroll: true });
    A(/Send anyway/.test(send.text), `button label is "Send anyway" (is "${send.text}")`);
  }, { clearance: true });
  await step('07-claim-withdraw', 'Withdraw the report (confirm sheet)', async () => {
    await goBack();
    await waitFor({ text: 'Your reports' }, 10000);
    A(sentId != null, 'know which report to withdraw');
    await tap({ testid: `claim-withdraw-${sentId}` });
    await waitFor({ text: 'Withdraw this report?' });
  });
  await step('07-claim-withdrawn', 'After withdrawing', async () => {
    await tap({ text: 'Withdraw report' });
    await sleep(1200);
    const d = await invoiceApi(target.id);
    const still = (d.claims || []).find((c) => c.id === sentId);
    A(still && still.status === 'WITHDRAWN', `report status is ${still && still.status}`);
    const mineWaiting = (d.claims || []).filter((c) => c.status === 'SUBMITTED' && c.id === sentId);
    A(mineWaiting.length === 0, 'no longer waiting');
    A(!(await has({ testid: `claim-withdraw-${sentId}` })), 'Withdraw button is gone for it');
    const after = (d.claims || []).filter((c) => c.status === 'SUBMITTED').reduce((a, c) => a + Number(c.amount), 0);
    A(Math.abs(after - waitingBefore) < 0.005, `waiting total back to ${waitingBefore} (is ${after})`);
  });
});

// 8 ── statement
section('8', 'Statement', { key: true }, async () => {
  let lines = [];
  await step('08-statement', 'Statement (Sri Balaji Traders)', async () => {
    await openSupplierDetail('Sri Balaji Traders');
    await tap({ testid: 'credit-statement-row' });
    await waitFor({ testid: 'statement-opening' });
    const t = await bodyText();
    A(/Owed at start/.test(t) && /Owed now/.test(t), 'summary card (Owed at start / Owed now)');
    A(/Owed ₹[\d,.]+ after/.test(t), '"Owed ₹x after" on rows');
    A(/[−-]₹[\d,.]+/.test(t), 'repayments carry a minus sign');
    A(/(January|February|March|April|May|June|July|August|September|October|November|December)/.test(t), 'month group headers');
    lines = ((await api('/credit/agreements/1/statement', { token: await restToken() })).data || {}).lines || [];
    note(`API statement lines ${lines.length}, with wallet entry ${lines.filter((l) => l.walletEntryId != null).length}`);
  }, { clearance: true });
  await step('08-statement-period', 'Statement: Change period sheet', async () => {
    await tap({ testid: 'statement-filter' });
    await waitFor({ text: 'Show statement for' });
  });
  await step('08-statement-wallet-line', 'Wallet repayment line opens the wallet transaction', async () => {
    await tap({ label: 'Close the period chooser' });
    await sleep(400);
    const w = lines.find((l) => l.walletEntryId != null);
    A(!!w, 'the statement has a wallet repayment line');
    if (!w) return;
    const rows = JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('[data-testid=statement-row]')].map((e,i)=>({i,label:e.getAttribute('aria-label')||''})))`));
    const idx = rows.findIndex((r) => /wallet/i.test(r.label) && /Open/.test(r.label));
    A(idx >= 0, 'a statement row mentioning the wallet is tappable');
    await tap({ testid: 'statement-row', nth: idx });
    await sleep(1500); await b.settle();
    const p = await b.ev('location.pathname');
    A(/\/restaurant\/wallet\/transaction\/\d+/.test(p), `landed on the wallet transaction page (${p})`);
    const id = Number((p.match(/(\d+)$/) || [])[1]);
    A(lines.some((l) => l.walletEntryId === id), `entry ${id} is one of the statement's wallet entries`);
    const t = await bodyText();
    A(/Paid to/.test(t) || /repayment/i.test(t), 'transaction page names the payment');
  });
});

// 9 ── wallet history
section('9', 'Wallet history: Credit repayment', { key: false }, async () => {
  await step('09-wallet-history', 'Wallet History', async () => {
    await home();
    await tap({ testid: 'action-wallet' });
    await waitFor({ testid: 'action-history' }, 15000);
    await tap({ testid: 'action-history' });
    await waitFor({ testid: 'history-list' }, 15000);
    const t = await bodyText();
    A(/Credit repayment/.test(t), 'History has "Credit repayment" rows');
    const rows = JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('[data-testid=history-list] [role=button],[data-testid=history-list] [tabindex="0"]')].filter(e=>/Credit repayment/.test(e.innerText)).map(e=>e.innerText.replace(/\\n+/g,' | ')))`));
    note(`credit repayment rows: ${rows.length}; first: ${rows[0]}`);
    A(rows.length > 0 && rows.every((r) => !/Bill (pending|added|reviewed)|Reading bill|Check bill|Add bill/.test(r)), 'no bill chip on Credit repayment rows');
  });
  await step('09-wallet-credit-detail', 'Credit repayment: transaction page', async () => {
    await tap({ text: 'Credit repayment', nth: 0 });
    await waitFor({ text: 'Invoices settled' }, 15000);
    const t = await bodyText();
    A(/Paid to/.test(t), '"Paid to"');
    A(/Invoices settled/.test(t), '"Invoices settled"');
    A(!!(await has({ testid: 'view-in-credit' })), '"View in Credit" link');
    A(!/Add bill|Bill pending|Bill added/.test(t), 'no bill row on a credit repayment');
  });
  await step('09-wallet-view-in-credit', 'View in Credit lands on the supplier credit line', async () => {
    await tap({ testid: 'view-in-credit' });
    await waitFor({ text: 'Statement' }, 15000);
    const p = await b.ev('location.pathname');
    A(/\/restaurant\/credit\/\d+$/.test(p), `landed on a credit line (${p})`);
  });
});

// 10 ── request credit
section('10', 'Request credit', { key: true }, async () => {
  await step('10-request', 'Request credit: form', async () => {
    await openCredit();
    await tap({ text: 'Request credit from another supplier' });
    await waitFor({ testid: 'send-request' });
  }, { clearance: true });
  await keyboardSim('10-kbd-sim-request', 'Request form with a short window (soft keyboard approximation)', 'input[data-testid=limit-field]', '[data-testid=send-request]');
  for (const term of ['Metro', 'Deccan', 'Sri', 'zzz']) {
    await step(`10-request-${term.toLowerCase()}`, `Request credit: search "${term}"`, async () => {
      await typeInto({ placeholder: 'Supplier name' }, term);
      await sleep(1500); await b.settle();
      const rows = JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('[data-testid^="supplier-row-"]')].map(e=>({label:e.getAttribute('aria-label'),disabled:e.getAttribute('aria-disabled'),role:e.getAttribute('role'),text:e.innerText.replace(/\\n+/g,' | ')})))`));
      note(`results: ${rows.map((r) => `${r.text} [disabled=${r.disabled}]`).join(' || ') || 'none'}`);
      if (term === 'zzz') {
        A(rows.length === 0, 'no rows for "zzz"');
        A(/No supplier matching/.test(await bodyText()), 'no-results message shown');
      } else {
        A(rows.length >= 1, `"${term}" returns a row`);
        for (const r of rows) {
          A(/already have credit|Credit line active|Active/i.test(r.text), `row "${r.text}" shows a status text for the existing line`);
          A(r.disabled === 'true', `row "${r.text}" is not selectable`);
        }
      }
    });
  }
});


// 3b ── pay the overdue suppliers for real (local test money)
section('3b', 'Pay overdue from the wallet, for real', { key: false }, async () => {
  const owe = (t) => ({ owed: money((t.match(/You owe\s*\n?\s*(₹[\d,.]+)/) || [])[1] || ''), overdue: money((t.match(/(₹[\d,.]+) overdue/) || [])[1] || '') });
  let beforeOwe; let wallet; let total; let ticked;
  await step('03-pay-run-sheet', 'Before paying: sheet', async () => {
    await openCredit();
    beforeOwe = owe(await bodyText());
    note(`before: owed ${beforeOwe.owed}, overdue ${beforeOwe.overdue}`);
    await tap({ testid: 'pay-from-wallet' });
    await waitFor({ text: 'Pay overdue to' });
    wallet = money(await testText('multi-wallet'));
    let rows = await tickedRows();
    if (!rows.some((r) => r.on)) {
      if (!process.env.PAY_ANYWAY) { note('nothing is overdue any more, so there is nothing to pay in this step (PAY_ANYWAY=1 pays the smallest supplier instead; it uses the data up)'); ticked = 0; return; }
      const small = rows.slice().sort((x, y) => rowAmount(x.label) - rowAmount(y.label))[0];
      note(`nothing overdue: ticking ${small.label} by hand (PAY_ANYWAY)`);
      await tap({ testid: small.id }); await sleep(300);
    }
    total = money(await testText('multi-total'));
    ticked = (await tickedRows()).filter((r) => r.on).length;
    note(`wallet ${wallet}, total ${total}, ticked ${ticked}`);
    A(wallet >= total, `wallet (${wallet}) covers the total (${total})`);
  });
  await step('03-pay-result', 'Result sheet', async () => {
    if (!ticked) { note('skipped: nothing was ticked'); return; }
    await tap({ testid: 'multi-pay' }, { settle: false });
    await waitFor({ testid: 'multi-done' }, 30000);
    await sleep(800);
    const t = await bodyText();
    const m = t.match(/Paid (\d+) of (\d+)/);
    A(!!m && Number(m[1]) === ticked && Number(m[2]) === ticked, `title says "Paid ${ticked} of ${ticked}" (${m ? m[0] : 'not found: ' + (t.match(/Nothing was paid|Paying…/) || [''])[0]})`);
    const now = money(await testText('multi-balance-now') || '');
    A(Math.abs(now - (wallet - total)) < 0.005, `"Wallet balance now" ${now} equals ${wallet} - ${total} = ${wallet - total}`);
  });
  await step('03-pay-after', 'Overview after Done: totals refreshed', async () => {
    if (!ticked) { await tap({ label: 'Close', exact: false }, { optional: true }); note('skipped: nothing was paid'); return; }
    await tap({ testid: 'multi-done' });
    await sleep(1500); await b.settle();
    const a = owe(await bodyText());
    note(`after: owed ${a.owed}, overdue ${a.overdue}`);
    A(Math.abs((beforeOwe.owed - a.owed) - total) < 0.005, `owed fell by ${total} (${beforeOwe.owed} -> ${a.owed})`);
    A(!(a.overdue > 0) || a.overdue < beforeOwe.overdue, `overdue fell (${beforeOwe.overdue} -> ${a.overdue})`);
  }, { clearance: true });
});

// 11 ── supplier's Credit tab (older screens)
section('11', "Supplier's Credit tab", { key: false, who: 'supplier' }, async () => {
  await step('11-supplier-home', 'Supplier home', async () => {
    await b.goto(`${WEB}/supplier`);
    await waitFor({ css: 'a[href*="credit"]' }, 25000);
    await b.settle();
  });
  await step('11-supplier-credit-requests', 'Supplier Credit: Requests', async () => {
    await tap({ css: 'a[href*="credit"]' });
    await waitFor({ text: 'Portfolio' }, 15000);
    await b.settle();
  }, { clearance: true });
  await step('11-supplier-credit-portfolio', 'Supplier Credit: Portfolio', async () => {
    await tap({ text: 'Portfolio' });
    await b.settle();
  }, { clearance: true });
  let opened = false;
  await step('11-supplier-credit-line', 'Supplier: a credit line', async () => {
    const f = await tap({ text: 'Indiranagar', nth: 0 }, { optional: true });
    if (!f) { const t = await bodyText(); note('no tappable portfolio row found; text: ' + t.slice(0, 200)); return; }
    await sleep(1500); await b.settle();
    opened = /\/supplier\/credit\/\d+/.test(await b.ev('location.pathname'));
    A(opened, `credit line detail opened (${await b.ev('location.pathname')})`);
  }, { clearance: true });
  if (opened) {
    for (const [label, name] of [['Edit Terms', 'edit'], ['Suspend', 'suspend']]) {
      await step(`11-supplier-credit-line-${name}`, `Supplier: credit line, ${label} form (not saved)`, async () => {
        await scrollTop();
        const f = await tap({ text: label }, { optional: true });
        if (!f) note(`no "${label}" button found`);
      }, { clearance: true });
      if (name === 'edit') await keyboardSim('11-kbd-sim-supplier-edit', 'Supplier Edit Terms with a short window (soft keyboard approximation)', 'input[aria-label="Credit limit"]', '[aria-label="Save New Terms"]');
      await tap({ text: 'Cancel' }, { optional: true });
    }
    await step('11-supplier-credit-line-end', 'Supplier: credit line, further down', async () => {
      await b.ev(`(()=>{for(const e of document.querySelectorAll('div')){const c=getComputedStyle(e);if((c.overflowY==='auto'||c.overflowY==='scroll')&&e.scrollHeight>e.clientHeight+50&&e.clientHeight>400)e.scrollTop=e.scrollHeight/2}})()`);
      await sleep(400);
    });
  }
});

// END SECTIONS


async function main() {
  b = new Browser(PORT);
  await b.connect();
  const state = { };
  // the small and large phones first (read-only key screens), then the main 390x844 run, which includes the steps that move money
  for (const [vw, vh] of [...(process.env.VIEWS === '0' ? [] : [[360, 740], [412, 915]]), [390, 844]]) {
    view = [vw, vh];
    await b.viewport(vw, vh);
    console.log(`\n=== viewport ${vw}x${vh} ===`);
    for (const s of sections) {
      if (ONLY && !ONLY.includes(String(s.n))) continue;
      if (vw !== 390 && !s.key) continue;
      await signIn(s.who === 'supplier' ? SUP : REST);
      console.log(`--- ${s.n} ${s.title}`);
      try { await s.fn(state); if (s.who !== 'supplier') await saveTokens(REST); } catch (e) { console.log(`   SECTION ERROR: ${e.message}`); results.push({ id: `section-${s.n}`, title: s.title, view: `${vw}x${vh}`, fails: [`SECTION: ${e.message}`], passes: [], notes: [], checks: {} }); }
    }
  }
  fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results.map((r) => ({ ...r, res: undefined })), null, 1));
  const failN = results.filter((r) => r.fails.length || Object.values(r.checks).some((c) => c.status === 'FAIL')).length;
  writeReport(results.map((r) => ({ ...r, res: undefined })));
  console.log(`\n${results.length} steps, ${failN} with FAIL`);
  await b.close();
  process.exit(0);
}
function writeReport(rs) {
  const L = [];
  const stat = (r, k) => (r.checks[k] ? r.checks[k].status : '-');
  L.push('# Credit UI walkthrough: automatic results', '', `Generated ${new Date().toISOString()} by tools/credit-e2e/ui-walk.js. ${rs.length} steps. Screenshots: PNG with the step name; wording: texts.json.`, '');
  L.push('| step | view | overlap | clipping | tap targets | console | raw | clearance | asserts |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const bad = r.fails.length;
    L.push(`| ${r.id} | ${r.view} | ${stat(r, 'overlap')} | ${stat(r, 'clipping')} | ${stat(r, 'tapTargets')} | ${stat(r, 'console')} | ${stat(r, 'raw')} | ${stat(r, 'clearance')} | ${bad ? `FAIL (${bad})` : `PASS (${r.passes.length})`} |`);
  }
  L.push('', '## Evidence', '');
  for (const r of rs) {
    const lines = [];
    for (const f of r.fails) lines.push(`- ${f}`);
    for (const [k, v] of Object.entries(r.checks)) {
      if (v.status === 'PASS' && k !== 'clearance') continue;
      if (k === 'tapTargets') lines.push(`- tap targets under 44px (${v.items.length}): ${v.items.slice(0, 6).join('; ')}${v.items.length > 6 ? '; ...' : ''}`);
      else for (const i of v.items.slice(0, 8)) lines.push(`- ${k} ${v.status}: ${i}`);
    }
    for (const n of r.notes) lines.push(`- note: ${n}`);
    if (lines.length) L.push(`### ${r.id}: ${r.title}`, ...lines, '');
  }
  fs.writeFileSync(path.join(SHOTS, 'REPORT-auto.md'), L.join('\n'));
}
if (process.argv[2] === '--report') {
  writeReport(JSON.parse(fs.readFileSync(path.join(SHOTS, 'results.json'), 'utf8')));
  console.log('wrote REPORT-auto.md');
} else if (require.main === module) main().catch((e) => { console.error('DRIVER CRASH:', e); process.exit(2); });
