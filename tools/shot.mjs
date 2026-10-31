// shot.mjs — capture the Vid Studio lock screen via CDP (headless chromium).
// Loads the extension, opens its sidepanel.html as a target, screenshots it.
// Usage: node tools/shot.mjs <ext-dir> <out.png>
import { WebSocket } from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT = process.argv[2];
const OUT = process.argv[3];
if (!EXT || !OUT) { console.error('usage: node shot.mjs <ext-dir> <out.png>'); process.exit(1); }

const PORT = 9333;
const PROFILE = mkdtempSync(join(tmpdir(), 'vs-profile-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { spawn } = await import('node:child_process');
const proc = spawn('/usr/bin/chromium', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  `--load-extension=${EXT}`,
  `--disable-extensions-except=${EXT}`,
  '--no-first-run', '--no-default-browser-check',
  '--window-size=500,900',
  'about:blank',
], { stdio: 'ignore' });

const getJSON = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`)).json();

let ws = null;
try {
  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await getJSON('/json/version'); break; } catch { await sleep(250); }
  }
  if (!version) throw new Error('devtools endpoint never came up');

  // find extension id from its service worker target
  let extId = null;
  for (let i = 0; i < 40 && !extId; i++) {
    const list = await getJSON('/json/list');
    const sw = list.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    if (sw) extId = new URL(sw.url).host;
    else await sleep(250);
  }
  if (!extId) throw new Error('extension service worker never appeared');
  console.log('ext id:', extId);

  // open sidepanel.html as a page target via the browser-level socket
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 0;
  const call = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    const onMsg = (data) => {
      const m = JSON.parse(data);
      if (m.id === mid) { ws.off('message', onMsg); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  const { targetId } = await call('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  ws.close(); ws = null;

  // attach to the new page target
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    const list = await getJSON('/json/list');
    page = list.find((t) => t.id === targetId);
    if (!page) await sleep(250);
  }
  if (!page) throw new Error('page target not found after createTarget');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  id = 0;
  const pcall = call; // reuse same closure shape with fresh socket below

  let pid = 0;
  const p2 = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++pid;
    const onMsg = (data) => {
      const m = JSON.parse(data);
      if (m.id === mid) { ws.off('message', onMsg); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await p2('Runtime.enable');
  await sleep(1200);

  const title = await p2('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
  const h2 = await p2('Runtime.evaluate', { expression: "document.querySelector('#lock h2')?.textContent || 'NO LOCK SCREEN'", returnByValue: true });
  const brand = await p2('Runtime.evaluate', { expression: "document.querySelector('.logo-text strong')?.textContent || '-'", returnByValue: true });

  const shot = await p2('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  console.log('title:', title.result.value);
  console.log('brand:', brand.result.value);
  console.log('lock h2:', h2.result.value);
  console.log('saved:', OUT);
} finally {
  try { ws?.close(); } catch {}
  proc.kill('SIGKILL');
}
