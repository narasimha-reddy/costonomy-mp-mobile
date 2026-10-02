/* global Buffer */
// Minimal CDP driver: loads a page, reports console errors and rendered text,
// and runs a scripted sequence of taps/typing.
// Resolved from this file upward, so it finds the repo's own node_modules
// however the script is invoked.
const WebSocket = require('ws');
// Chrome's remote-debugging port. Override with CDP_PORT.
const PORT = process.env.CDP_PORT || 9333;
const URL = process.argv[2] || 'http://localhost:7071/';
const STEPS = JSON.parse(process.argv[3] || '[]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no debuggable page');
}

(async () => {
  const ws = new WebSocket(await target(), { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(`[console.${m.params.type}] ${(m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[pageerror] ${d.exception?.description || d.text}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return `EVAL ERROR: ${r.result.exceptionDetails.exception?.description}`;
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  if (process.env.PRELOAD) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: process.env.PRELOAD });
  }
  await send('Page.navigate', { url: URL });
  await sleep(12000);

  const report = async (label) => {
    const text = await evaluate('document.body ? document.body.innerText : "(no body)"');
    const route = await evaluate('location.pathname + location.search');
    console.log(`\n===== ${label} | route=${route} =====`);
    console.log(String(text).split('\n').filter((l) => l.trim()).join('\n'));
  };
  await report('initial render');

  for (const step of STEPS) {
    if (step.eval) console.log(`\n--- eval: ${step.label || step.eval.slice(0, 50)} -> ${JSON.stringify(await evaluate(step.eval))}`);
    if (step.wait) await sleep(step.wait);
    if (step.report) await report(step.report);
    if (step.setFile) {
      // Drive a real <input type=file>: expo-image-picker on web creates one and
      // clicks it, and a native file dialog cannot be driven any other way.
      await send('DOM.enable');
      const doc = await send('DOM.getDocument', { depth: -1, pierce: true });
      const found = await send('DOM.querySelector', {
        nodeId: doc.result.root.nodeId, selector: 'input[type=file]',
      });
      if (!found.result || !found.result.nodeId) {
        console.log('--- setFile: no file input on the page');
      } else {
        await send('DOM.setFileInputFiles', {
          nodeId: found.result.nodeId, files: [step.setFile],
        });
        console.log(`--- setFile: ${step.setFile}`);
      }
    }
    if (step.shot) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      require('fs').writeFileSync(step.shot, Buffer.from(r.result.data, 'base64'));
      console.log(`\n--- screenshot: ${step.shot}`);
    }
  }

  console.log('\n===== console/errors =====');
  const noisy = logs.filter((l) => !/Logs will appear|React DevTools|\[console\.debug\]/.test(l));
  console.log(noisy.length ? noisy.join('\n') : '(no console errors)');
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('DRIVER FAIL:', e.message); process.exit(1); });
