/* global Buffer */
// Browser driver for ui-walk.js: Chrome DevTools Protocol over `ws` (same idea as tools/webcheck/cdp.js), plus
// the in-page layout checks. LOCAL ONLY: it refuses any web or API host that is not local or on the LAN.
const fs = require('fs');
const WebSocket = require('ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── in-page layout checks (serialised into the page, so they must be self-contained) ─────────────────────────────
function pageCheck(opts) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const INTER = 'button,a[href],input,textarea,select,[role=button],[role=tab],[role=checkbox],[role=radio],'
    + '[role=switch],[role=link],[role=menuitem],[tabindex="0"]';
  const r1 = (n) => Math.round(n * 10) / 10;
  const visEl = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || p.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const modals = [...document.querySelectorAll('[aria-modal="true"]')].filter(visEl);
  let root = document.body;
  let inModal = false;
  if (modals.length) {
    let r = modals[modals.length - 1];
    while (r.parentElement && r.parentElement !== document.body) r = r.parentElement;
    root = r;
    inModal = true;
  }
  const clip = (el, r) => {
    let x1 = Math.max(r.left, 0); let y1 = Math.max(r.top, 0);
    let x2 = Math.min(r.right, vw); let y2 = Math.min(r.bottom, vh);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { x1 = Math.max(x1, pr.left); x2 = Math.min(x2, pr.right); }
        if (cs.overflowY !== 'visible') { y1 = Math.max(y1, pr.top); y2 = Math.min(y2, pr.bottom); }
      }
    }
    return x2 > x1 && y2 > y1 ? { l: x1, t: y1, r: x2, b: y2 } : null;
  };
  const rs = (c) => `[${r1(c.l)},${r1(c.t)} ${r1(c.r - c.l)}x${r1(c.b - c.t)}]`;
  const snippet = (s, n = 40) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const desc = (el) => {
    const t = el.getAttribute('data-testid'); const a = el.getAttribute('aria-label');
    return `${el.tagName.toLowerCase()}${t ? `#${t}` : ''}${a ? `{${snippet(a, 30)}}` : ''}"${snippet(el.innerText || el.value || '', 30)}"`;
  };
  const inter = [];
  for (const el of root.querySelectorAll(INTER)) {
    if (!visEl(el) || getComputedStyle(el).pointerEvents === 'none') continue;
    const br = el.getBoundingClientRect();
    if (br.width * br.height === 0) continue;
    if (br.width >= vw * 0.95 && br.height >= vh * 0.9) continue; // scrim / full-screen wrapper
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const c = clip(el, br);
    inter.push({ el, br, c });
  }
  const texts = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const pe = n.parentElement;
    if (!pe || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(pe.tagName) || !visEl(pe)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const br = rg.getBoundingClientRect();
    if (br.width * br.height === 0) continue;
    const c = clip(pe, br);
    texts.push({ n, pe, br, c });
  }
  const inter2 = (a, b) => {
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    return w > 2 && h > 2 ? { w, h } : null;
  };
  const out = { overlap: [], occluded: [], hscroll: [], textOutside: [], truncated: [], small: [], raw: [], vw, vh, inModal,
    nInteractive: inter.length, nTexts: texts.length };

  // (a) interactive vs interactive, interactive vs non-ancestor text
  const flagged = new Set();
  for (let i = 0; i < inter.length; i++) {
    for (let j = i + 1; j < inter.length; j++) {
      const a = inter[i]; const b = inter[j];
      if (!a.c || !b.c || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = inter2(a.c, b.c);
      if (x) {
        flagged.add(`${i}:${j}`);
        out.overlap.push(`interactive/interactive ${desc(a.el)} ${rs(a.c)} x ${desc(b.el)} ${rs(b.c)} overlap ${r1(x.w)}x${r1(x.h)}px`);
      }
    }
  }
  const seenTextPairs = new Set();
  for (let i = 0; i < inter.length; i++) {
    const a = inter[i];
    if (!a.c) continue;
    for (const t of texts) {
      if (!t.c || a.el.contains(t.n)) continue;
      const x = inter2(a.c, t.c);
      if (!x) continue;
      // text inside another interactive that already overlaps this one was reported above
      const ti = inter.findIndex((o) => o.el.contains(t.n));
      if (ti >= 0 && (flagged.has(`${Math.min(i, ti)}:${Math.max(i, ti)}`))) continue;
      if (ti >= 0 && inter[ti].el.contains(a.el)) continue;
      const k = `${i}|${snippet(t.n.nodeValue, 25)}`;
      if (seenTextPairs.has(k)) continue;
      seenTextPairs.add(k);
      out.overlap.push(`interactive/text ${desc(a.el)} ${rs(a.c)} over text "${snippet(t.n.nodeValue, 40)}" ${rs(t.c)} overlap ${r1(x.w)}x${r1(x.h)}px`);
    }
  }
  // occlusion: an interactive element whose own pixels belong to something unrelated
  for (const a of inter) {
    if (!a.c) continue;
    const pts = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]];
    for (const [fx, fy] of pts) {
      const px = a.c.l + (a.c.r - a.c.l) * fx; const py = a.c.t + (a.c.b - a.c.t) * fy;
      const hit = document.elementFromPoint(px, py);
      if (hit && !a.el.contains(hit) && !hit.contains(a.el) && !(root !== document.body && !root.contains(hit))) {
        out.occluded.push(`${desc(a.el)} ${rs(a.c)} is covered at (${r1(px)},${r1(py)}) by ${desc(hit)}`);
        break;
      }
      if (hit && root !== document.body && !root.contains(hit)) break;
    }
  }
  // (b) clipping
  const de = document.scrollingElement || document.documentElement;
  if (de.scrollWidth > window.innerWidth + 1) out.hscroll.push(`page scrollWidth ${de.scrollWidth} > viewport ${window.innerWidth}`);
  for (const t of texts) {
    if (!t.c) continue;
    if (t.br.right > vw + 1 || t.br.left < -1) {
      let xs = false;
      for (let p = t.pe; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) { xs = true; break; }
      }
      if (!xs) out.textOutside.push(`text "${snippet(t.n.nodeValue, 40)}" ${rs({ l: t.br.left, t: t.br.top, r: t.br.right, b: t.br.bottom })} is outside the ${vw}px viewport`);
    }
  }
  for (const a of inter) {
    if (!a.c) continue;
    if (a.br.right > vw + 1 || a.br.left < -1) {
      let xs = false;
      for (let p = a.el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) { xs = true; break; }
      }
      if (!xs) out.textOutside.push(`${desc(a.el)} ${rs({ l: a.br.left, t: a.br.top, r: a.br.right, b: a.br.bottom })} extends beyond the ${vw}px viewport (cut off on a phone)`);
    }
  }
  const seenEl = new Set();
  for (const t of texts) {
    const el = t.pe;
    if (seenEl.has(el)) continue;
    seenEl.add(el);
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX !== 'visible'; const clipsY = cs.overflowY !== 'visible';
    if ((clipsX && el.scrollWidth > el.clientWidth + 1) || (clipsY && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0)) {
      out.truncated.push(`"${snippet(el.innerText || t.n.nodeValue, 50)}" ${desc(el)} client ${el.clientWidth}x${el.clientHeight} scroll ${el.scrollWidth}x${el.scrollHeight}`);
    }
  }
  // (c) tap targets
  for (const a of inter) {
    if (!a.c) continue;
    const w = a.br.width; const h = a.br.height;
    if (w < 44 || h < 44) {
      // a text field wrapped in a larger box is fine: report the interactive element only
      out.small.push(`${desc(a.el)} ${r1(w)}x${r1(h)}px at (${r1(a.br.left)},${r1(a.br.top)})`);
    }
  }
  // (e) raw codes
  const grp = new Map();
  for (const t of texts) if (t.c) grp.set(t.pe, (grp.get(t.pe) || '') + t.n.nodeValue);
  const txt = [...grp.values()].map((v) => v.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const rawRe = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b|\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|Invalid Date|₹\s*NaN|\bTypeError\b|\bError:/g;
  const found = new Set(txt.match(rawRe) || []);
  for (const f of found) out.raw.push(f);
  const fields = [...root.querySelectorAll('input,textarea')].map((e) => e.value).join(' ');
  for (const f of fields.match(rawRe) || []) out.raw.push(`input value: ${f}`);
  out.text = txt;
  out.title = snippet(document.title, 60);
  out.path = location.pathname + location.search;
  return out;
}

// the largest vertically scrollable area of the screen (not a sheet), scrolled to its end; reports clearance above a bar
function pageClearance() {
  const vh = window.innerHeight;
  const vis = (el) => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || p.getAttribute('aria-hidden') === 'true') return false; } return true; };
  const bars = [...document.querySelectorAll('[data-testid=credit-pay-bar-button],[data-testid=credit-i-paid-bar-button],[data-testid=claim-send],[data-testid=send-request],[data-testid=invoice-pay],[data-testid=invoice-i-paid]')].filter(vis);
  let best = null;
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if (!(cs.overflowY === 'auto' || cs.overflowY === 'scroll')) continue;
    if (el.scrollHeight <= el.clientHeight + 2 || el.clientHeight < vh * 0.3 || !vis(el)) continue;
    if (el.closest('[aria-modal="true"]')) continue;
    if (!best || el.clientHeight > best.clientHeight) best = el;
  }
  const res = { scroller: !!best, bar: bars.length > 0 };
  if (!best) return res;
  res.beforeTop = best.scrollTop;
  best.scrollTop = best.scrollHeight;
  const sr = best.getBoundingClientRect();
  res.scrollerBottom = Math.round(sr.bottom);
  let last = 0; let lastEl = null;
  for (const el of best.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height === 0 || !vis(el)) continue;
    const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
    if (!(hasText || el.matches('button,input,[role=button],[tabindex="0"]'))) continue;
    if (r.bottom > last) { last = r.bottom; lastEl = el; }
  }
  res.lastBottom = Math.round(last);
  res.lastText = lastEl ? String(lastEl.innerText || '').replace(/\s+/g, ' ').slice(0, 40) : '';
  if (bars.length) {
    let top = Infinity;
    for (const b of bars) {
      let e = b;
      while (e.parentElement && e.parentElement.getBoundingClientRect().width < sr.width - 2) e = e.parentElement;
      top = Math.min(top, e.getBoundingClientRect().top);
    }
    res.barTop = Math.round(top);
    res.gap = Math.round(top - last);
  } else {
    res.gap = Math.round(sr.bottom - last);
  }
  res.atEnd = best.scrollTop + best.clientHeight >= best.scrollHeight - 2;
  res.scrollerId = best.getAttribute('data-testid') || '';
  return res;
}

// ── browser session ───────────────────────────────────────────────────────────────────────────────────────────
class Browser {
  constructor(port) { this.port = port; this.id = 0; this.pending = new Map(); this.reset(); this.inflight = new Map(); }
  reset() { this.logs = []; this.netFails = []; }
  async connect() {
    let wsUrl;
    for (let i = 0; i < 40 && !wsUrl; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        const pg = list.find((t) => t.type === 'page');
        if (pg) wsUrl = pg.webSocketDebuggerUrl;
      } catch { /* retry */ }
      if (!wsUrl) await sleep(500);
    }
    if (!wsUrl) throw new Error(`no Chrome page on debug port ${this.port}`);
    this.ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((r) => this.ws.on('open', r));
    this.ws.on('message', (raw) => this.onMessage(JSON.parse(raw)));
    for (const d of ['Runtime', 'Page', 'Network', 'Log']) await this.send(`${d}.enable`);
    // Expo's dev-only error toast sits over the bottom 90px of every page and opens a full-screen overlay when tapped:
    // hide it on every new document (its text is still read before each step, and console errors are recorded anyway)
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const add=()=>{if(document.getElementById('walk-hide')||!document.head)return;const s=document.createElement('style');s.id='walk-hide';s.textContent='#error-toast{opacity:0!important;pointer-events:none!important}';document.head.appendChild(s)};add();document.addEventListener('DOMContentLoaded',add);new MutationObserver(add).observe(document,{childList:true,subtree:true})})()` });
  }
  onMessage(m) {
    if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); return; }
    const p = m.params || {};
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
      this.logs.push(`console.error: ${(p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300)}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails || {};
      this.logs.push(`pageerror: ${(d.exception?.description || d.text || '').split('\n')[0].slice(0, 300)}`);
    } else if (m.method === 'Network.requestWillBeSent') {
      if (/\/api\//.test(p.request.url)) this.inflight.set(p.requestId, { url: p.request.url, method: p.request.method, t: Date.now() });
    } else if (m.method === 'Network.responseReceived') {
      const rec = this.inflight.get(p.requestId);
      if (rec && p.response.status >= 400) {
        const path = new URL(p.response.url).pathname.replace(/^.*\/api\/v1/, '');
        rec.status = p.response.status; rec.path = path;
        const entry = { status: p.response.status, method: rec.method, path, code: '' };
        this.netFails.push(entry);
        this.send('Network.getResponseBody', { requestId: p.requestId }).then((r) => {
          try { entry.code = JSON.parse(r.result.body).error?.code || ''; } catch { /* not json */ }
        }).catch(() => {});
      }
    } else if (m.method === 'Network.loadingFinished') {
      this.inflight.delete(p.requestId);
    } else if (m.method === 'Network.loadingFailed') {
      const rec = this.inflight.get(p.requestId);
      if (rec && !p.canceled) this.netFails.push({ status: 0, method: rec.method, path: new URL(rec.url).pathname.replace(/^.*\/api\/v1/, ''), code: p.errorText });
      this.inflight.delete(p.requestId);
    } else if (m.method === 'Log.entryAdded' && p.entry.level === 'error' && !/\/api\//.test(p.entry.url || '')) {
      this.logs.push(`log.error: ${p.entry.text.slice(0, 200)} ${p.entry.url || ''}`);
    }
  }
  send(method, params = {}) {
    return new Promise((res) => { const i = ++this.id; this.pending.set(i, res); this.ws.send(JSON.stringify({ id: i, method, params })); });
  }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`eval error: ${r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text}`);
    return r.result?.result?.value;
  }
  async fn(f, arg) { return this.ev(`(${f.toString()})(${JSON.stringify(arg === undefined ? null : arg)})`); }
  async viewport(w, h) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  async goto(url) { await this.send('Page.navigate', { url }); await sleep(1500); }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }
  /** wait until no /api request is in flight, no spinner and no skeleton for `quiet` ms */
  async settle({ quiet = 700, max = 20000 } = {}) {
    const t0 = Date.now(); let calmSince = 0;
    while (Date.now() - t0 < max) {
      const busy = await this.ev(`!!document.querySelector('[role=progressbar]:not([data-testid=credit-utilisation-bar]),[data-testid*=skeleton],[aria-busy=true]')`);
      if (this.inflight.size === 0 && !busy) { if (!calmSince) calmSince = Date.now(); if (Date.now() - calmSince >= quiet) return true; } else calmSince = 0;
      await sleep(120);
    }
    return false;
  }
  // element lookup runs in the page; returns centre + info or null
  async find(spec) { return this.fn(findInPage, spec); }
  async mouse(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async close() { try { this.ws.close(); } catch { /* ignore */ } }
}

// finds an interactive element by testid / aria-label / visible text, scrolls it into view, hit-tests its centre
function findInPage(spec) {
  const vis = (el) => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || p.getAttribute('aria-hidden') === 'true') return false; } return true; };
  const modals = [...document.querySelectorAll('[aria-modal="true"]')].filter(vis);
  let root = document.body;
  if (modals.length && !spec.page) {
    let r = modals[modals.length - 1];
    while (r.parentElement && r.parentElement !== document.body) r = r.parentElement;
    root = r;
  }
  const INTER = 'button,a[href],input,textarea,select,[role=button],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=link],[tabindex="0"]';
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const matchS = (s, want) => (spec.exact === false ? norm(s).toLowerCase().includes(want.toLowerCase()) : norm(s) === want);
  let cands = [];
  if (spec.css) cands = [...root.querySelectorAll(spec.css)];
  else if (spec.placeholder) cands = [...root.querySelectorAll(`input[placeholder="${spec.placeholder}"],textarea[placeholder="${spec.placeholder}"]`)];
  else if (spec.testid) cands = [...root.querySelectorAll(`[data-testid="${spec.testid}"]`)];
  else if (spec.testidPrefix) cands = [...root.querySelectorAll(`[data-testid^="${spec.testidPrefix}"]`)];
  else if (spec.label) cands = [...root.querySelectorAll('[aria-label]')].filter((e) => matchS(e.getAttribute('aria-label'), spec.label));
  else if (spec.text) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!matchS(n.nodeValue, spec.text) && !(spec.exact === false)) continue;
      if (spec.exact === false && !matchS(n.nodeValue, spec.text)) continue;
      let el = n.parentElement;
      const hit = el.closest(INTER) || el;
      if (!seen.has(hit)) { seen.add(hit); cands.push(hit); }
    }
    // aria-label buttons whose visible text differs
    for (const e of root.querySelectorAll('[aria-label]')) {
      if (matchS(e.getAttribute('aria-label'), spec.text) && !seen.has(e)) { seen.add(e); cands.push(e); }
    }
  }
  cands = cands.map((e) => (e.matches(INTER) ? e : e.closest(INTER) || e)).filter((e, i, a) => a.indexOf(e) === i);
  cands = cands.filter((e) => vis(e) && e.getBoundingClientRect().width > 0);
  if (spec.inside) {
    const w = [...root.querySelectorAll(`[data-testid="${spec.inside}"]`)][0];
    cands = cands.filter((e) => w && w.contains(e));
  }
  if (spec.disabled === false) cands = cands.filter((e) => e.getAttribute('aria-disabled') !== 'true' && !e.disabled);
  const el = cands[spec.nth || 0];
  if (!el) return { found: false, count: cands.length };
  if (!spec.noScroll) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
  const hit = document.elementFromPoint(x, y);
  const blocked = !!hit && !el.contains(hit) && !hit.contains(el);
  const snip = (e) => `${e.tagName.toLowerCase()}${e.getAttribute('data-testid') ? '#' + e.getAttribute('data-testid') : ''}"${norm(e.innerText).slice(0, 30)}"`;
  return {
    found: true, count: cands.length, x, y, w: r.width, h: r.height, blocked, blocker: blocked ? snip(hit) : '',
    disabled: el.getAttribute('aria-disabled') === 'true' || !!el.disabled,
    checked: el.getAttribute('aria-checked'), text: norm(el.innerText).slice(0, 80), label: el.getAttribute('aria-label') || '',
    value: el.value === undefined ? undefined : el.value,
  };
}

module.exports = { Browser, pageCheck, pageClearance, findInPage, sleep };
