// Screenshot a page in headless Chrome over the DevTools protocol.
//   node tools/shot.mjs <url> <out.jpg> <width> <height> [scrollY|#selector] [waitMs] [js]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [url, out, w = '1180', h = '820', where = '0', wait = '2500', js = ''] = process.argv.slice(2);
const W = +w, H = +h;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9800 + Math.floor(Math.random() * 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = path.join(os.tmpdir(), 'vtol-shot-profile');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--no-first-run',
  '--hide-scrollbars', '--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(150); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(1200);
await run(`document.documentElement.style.scrollBehavior='auto'`);
// where: a selector / number, or a JSON list of [selector|number, offsetPx, name]
const list = where.startsWith('[') ? JSON.parse(where) : [[where, 0, '']];
if (js) console.log('js:', JSON.stringify(await run(js)));
for (const [sel, off = 0, name = ''] of list) {
  if (typeof sel === 'string' && (sel.startsWith('#') || sel.startsWith('.'))) await run(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 70 + ${+off});})()`);
  else await run(`window.scrollTo(0, ${+sel + +off})`);
  await sleep(+wait);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  const file = name ? out.replace(/\.jpg$/, `-${name}.jpg`) : out;
  await fs.writeFile(file, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', path.basename(file), 'scrollY', await run('scrollY'));
}
ws.close(); chrome.kill('SIGTERM');
