// Layout audit across iPad sizes in headless Chrome.
//   node tools/audit.mjs <url>
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const url = process.argv[2];
const SIZES = [[744,1133],[1133,744],[820,1180],[1180,820],[834,1210],[1210,834],[1024,1366],[1366,1024],[1032,1376],[1376,1032],[1133,670],[1180,740],[1366,950],[590,820],[678,1024],[375,820],[1920,1080]];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9950 + Math.floor(Math.random() * 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), 'vtol-audit')}`, '--no-first-run', '--hide-scrollbars', '--use-angle=metal', '--enable-gpu', 'about:blank'], { stdio: 'ignore' });
let t; for (let i = 0; i < 80 && !t; i++) { try { t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(150); } }
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
const AUDIT = `(function(){
  var vw=innerWidth, vh=innerHeight, out={vp:vw+'x'+vh};
  document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('in')});
  out.hScroll = document.documentElement.scrollWidth - vw;
  function clipped(el){ for(var a=el.parentElement;a&&a!==document.body;a=a.parentElement){var cs=getComputedStyle(a); if(cs.overflowX!=='visible'||cs.overflow==='hidden') return true;} return false; }
  function vis(el){ for(var a=el;a;a=a.parentElement){ var cs=getComputedStyle(a); if(cs.display==='none'||cs.visibility==='hidden') return false;} return true; }
  var wide=[]; document.querySelectorAll('main *, header *, footer *').forEach(function(el){ var r=el.getBoundingClientRect(); if(!r.width) return; if((r.right>vw+1||r.left<-1)&&!clipped(el)&&vis(el)) wide.push(((el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)||el.tagName).toString().slice(0,30)+':'+Math.round(r.left)+'-'+Math.round(r.right)); });
  out.overflow = wide.slice(0,6);
  var spill=[]; document.querySelectorAll('h1,h2,h3,p,dd,dt,li,td,th,button,a,.chapters__name').forEach(function(el){ if(!vis(el)||!el.clientWidth) return; if(el.scrollWidth>el.clientWidth+2&&getComputedStyle(el).overflowX==='visible') spill.push(el.textContent.trim().slice(0,28)+'('+el.scrollWidth+'>'+el.clientWidth+')'); });
  out.spill = spill.slice(0,6);
  var nav=document.getElementById('nav'); out.nav = (nav.scrollWidth<=nav.clientWidth+1?'fits':'OVER')+(getComputedStyle(nav.querySelector('.nav__links')).display!=='none'?'/links':'/menu');
  var st=document.querySelector('.hero__stage').getBoundingClientRect(), b=document.querySelector('.hero__actions').getBoundingClientRect();
  out.heroStage=[Math.round(st.width),Math.round(st.height)]; out.stageTopGap=Math.round(st.top-b.bottom); out.stageBottom=Math.round(st.bottom);
  var worst=999; document.querySelectorAll('[data-chapter]').forEach(function(ch){ var s0=vh>vw?.74:.56; ch.style.setProperty('--p',0); ch.style.setProperty('--s',s0);
    var ct=ch.querySelector('.chapter__title').getBoundingClientRect(), cm=ch.querySelector('.chapter__media').getBoundingClientRect(); worst=Math.min(worst,Math.round(cm.top-ct.bottom)); });
  out.chapterGapMin=worst;
  var small=0; document.querySelectorAll('a, button').forEach(function(el){ if(!vis(el)||el.closest('p,td,dd,figcaption,small')) return; var r=el.getBoundingClientRect(); if(!r.width) return;
    var after=getComputedStyle(el,'::after'); var hit=Math.max(r.height, after.content!=='none'?parseFloat(after.height)||0:0); if(hit<43.5) small++; });
  out.smallTargets=small;
  return JSON.stringify(out);
})()`;
await send('Page.navigate', { url });
await sleep(2500);
for (const [w, h] of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  await sleep(700);
  console.log(await run(AUDIT));
}
ws.close(); chrome.kill('SIGTERM');
