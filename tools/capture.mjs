// Drive headless Chrome over the DevTools protocol (no npm packages) and
// save frames from tools/render.html.
//   node tools/capture.mjs <jobs.json>
// jobs.json: { "base": "http://127.0.0.1:4192/tools/render.html", "out": "dir",
//   "init": {w,h,pr,alpha,fps}, "jobs": [{ "shot": "launch", "fps": 30, "type": "jpeg"|"png" }] }
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const cfg = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = path.join(cfg.out, '.chrome-profile');
await fs.mkdir(cfg.out, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
  `--window-size=${cfg.init.w},${cfg.init.h}`, 'about:blank',
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 80 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(150); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: cfg.init.w, height: cfg.init.h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: cfg.base });
for (let i = 0; i < 200; i++) { if (await run('!!(window.R && window.R.ready)').catch(() => false)) break; await sleep(150); }
const info = await run(`R.init(${JSON.stringify(cfg.init)})`);
const gl = await run(`(() => { const g = document.getElementById('c').getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`);
console.log('renderer', gl, JSON.stringify(info));

for (const job of cfg.jobs) {
  if (job.eval) { if (job.before) await run(job.before); console.log('EVAL', JSON.stringify(await run(job.eval))); continue; }
  const dur = await run(`R.shot(${JSON.stringify(job.shot)})`);
  const fps = job.fps || cfg.init.fps || 30;
  const times = job.times || null;                     // optional: sample only these times
  const n = times ? times.length : (dur ? Math.round(dur * fps) : 1);
  const type = job.type === 'png' ? 'image/png' : 'image/jpeg';
  const ext = job.type === 'png' ? 'png' : 'jpg';
  const dir = path.join(cfg.out, job.shot);
  await fs.mkdir(dir, { recursive: true });
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    const t = times ? times[f] : (dur ? f / fps : 0);
    const url = await run(`R.at(${t}, ${JSON.stringify(type)}, ${job.q || 0.94})`);
    const b64 = url.slice(url.indexOf(',') + 1);
    await fs.writeFile(path.join(dir, `f${String(f).padStart(4, '0')}.${ext}`), Buffer.from(b64, 'base64'));
  }
  console.log(`${job.shot}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
ws.close();
chrome.kill('SIGTERM');
