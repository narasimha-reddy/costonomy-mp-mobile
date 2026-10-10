#!/usr/bin/env node
/**
 * Renders the truck marker (lib/maps/truckSvg.ts, the same builder the web map uses) at four headings on a light,
 * map-like background, through headless Chrome, so the artwork can be looked at without running the app.
 *
 *   node tools/truck-preview/render.js [outDir]
 *
 * Writes truck-0.png, truck-90.png, truck-180.png, truck-270.png and contact-sheet.png (live and stale, at marker
 * size and enlarged). A development tool: no assertions. CHROME overrides the Chrome binary.
 */
/* global __dirname */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { spawn } = require('child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEADINGS = [0, 90, 180, 270];
const MARKER = 44; // TrackLayout.truckSize
const BIG = 176;

// Load the app's TypeScript as is: resolve the '@/' alias and transpile .ts on require.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) request = path.join(ROOT, request.slice(2));
  return resolve.call(this, request, ...rest);
};
// theme/layout.ts reads the window size and platform from react-native; a desktop browser's values stand in for them.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (o) => ('web' in o ? o.web : o.default) },
      Dimensions: { get: () => ({ width: 1280, height: 800, scale: 2, fontScale: 1 }) },
    };
  }
  return load.call(this, request, ...rest);
};
require.extensions['.ts'] =(mod, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  mod._compile(out.outputText, filename);
};
const { truckSvg } = require(path.join(ROOT, 'lib/maps/truckSvg.ts'));
const { Colors } = require(path.join(ROOT, 'theme/colors.ts'));

const outDir = path.resolve(process.argv[2] || path.join(process.cwd(), 'truck-preview'));
fs.mkdirSync(outDir, { recursive: true });

/** A light street-map look: pale ground, white roads with a grey casing, a park and a block of buildings. */
const MAP_BG = `
  background:
    linear-gradient(90deg, transparent 46%, #d7dbe0 46%, #d7dbe0 47%, #fff 47%, #fff 53%, #d7dbe0 53%, #d7dbe0 54%, transparent 54%),
    linear-gradient(0deg, transparent 46%, #d7dbe0 46%, #d7dbe0 47%, #fff 47%, #fff 53%, #d7dbe0 53%, #d7dbe0 54%, transparent 54%),
    #eef0f3;`;

function tile(heading, muted, px) {
  return `<div class="tile" style="width:${px * 1.6}px;height:${px * 1.6}px">
    <div class="park"></div>${truckSvg({ muted, heading, size: px })}
    <span>${heading}°${muted ? ' stale' : ''}</span></div>`;
}

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px; font: 12px -apple-system, sans-serif; color: ${Colors.textSecondary}; background: #fafafa; }
    .row { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
    .tile { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 8px; overflow: hidden; ${MAP_BG} }
    .park { position: absolute; left: 6%; top: 6%; width: 30%; height: 30%; background: #cdeccf; border-radius: 4px; }
    .tile svg { position: relative; }
    .tile span { position: absolute; left: 6px; bottom: 4px; }
    h3 { margin: 4px 0 8px; font-size: 13px; color: #333; }
  </style></head><body>${body}</body></html>`;
}

/**
 * One page to one PNG. Headless Chrome writes the screenshot but does not always exit afterwards, so the file is
 * watched and this Chrome (by its own PID) is stopped once the file is complete.
 */
async function shoot(html, file, width, height) {
  const tmp = path.join(os.tmpdir(), `truck-preview-${process.pid}-${path.basename(file, '.png')}.html`);
  fs.writeFileSync(tmp, html);
  fs.rmSync(file, { force: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'truck-preview-profile-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--force-device-scale-factor=2', `--screenshot=${file}`, `file://${tmp}`,
  ], { stdio: 'ignore' });
  let exited = false;
  chrome.on('exit', () => { exited = true; });
  const started = Date.now();
  let lastSize = -1;
  while (!exited && Date.now() - started < 30_000) {
    await new Promise((r) => setTimeout(r, 250));
    const size = fs.existsSync(file) ? fs.statSync(file).size : -1;
    if (size > 0 && size === lastSize) break;
    lastSize = size;
  }
  if (!exited) chrome.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(tmp, { force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  if (!fs.existsSync(file)) throw new Error(`no screenshot for ${file}`);
  console.log(file);
}

async function main() {
  for (const h of HEADINGS) {
    await shoot(page(`<div class="row">${tile(h, false, BIG)}${tile(h, false, MARKER)}</div>`),
      path.join(outDir, `truck-${h}.png`), Math.round(BIG * 1.6 + MARKER * 1.6 + 60), Math.round(BIG * 1.6 + 40));
  }
  const rows = [
    `<h3>Live, enlarged (${BIG}px)</h3><div class="row">${HEADINGS.map((h) => tile(h, false, BIG)).join('')}</div>`,
    `<h3>Live, marker size (${MARKER}px) and 45° steps</h3><div class="row">${[0, 45, 90, 135, 180, 225, 270, 315].map((h) => tile(h, false, MARKER)).join('')}</div>`,
    `<h3>Stale (muted)</h3><div class="row">${HEADINGS.map((h) => tile(h, true, BIG / 2)).join('')}${HEADINGS.map((h) => tile(h, true, MARKER)).join('')}</div>`,
  ].join('');
  await shoot(page(rows), path.join(outDir, 'contact-sheet.png'), 1240, 760);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
