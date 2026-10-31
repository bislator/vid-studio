// test-activate.mjs — end-to-end activation test through the real lock-screen UI.
// Launches chromium with the extension, enters a WRONG code (expect rejection),
// then a VALID code via the actual input + button, verifies the lock releases,
// and that activation persists in a freshly opened panel.
// Usage: node tools/test-activate.mjs <ext-dir> <valid-code> <shot-unlocked.png>
import { WebSocket } from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT = process.argv[2];
const CODE = process.argv[3];
const SHOT = process.argv[4];
if (!EXT || !CODE || !SHOT) { console.error('usage: node test-activate.mjs <ext-dir> <code> <out.png>'); process.exit(1); }

const PORT = 9334 + Math.floor(Math.random() * 500); // random port — no collisions with stale browsers
const PROFILE = mkdtempSync(join(tmpdir(), 'vs-test-'));
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
const cleanup = () => { try { proc.kill('SIGKILL'); } catch {} };
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
process.on('SIGINT', () => { cleanup(); process.exit(130); });

const getJSON = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: AbortSignal.timeout(3000) })).json();

let ws = null;
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

try {
  let version = null;
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await getJSON('/json/version'); } catch { await sleep(250); }
  }
  console.log('devtools up:', !!version);
  if (!version) throw new Error('devtools never came up');

  let extId = null;
  for (let i = 0; i < 40 && !extId; i++) {
    const list = await getJSON('/json/list');
    const sw = list.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    if (sw) extId = new URL(sw.url).host; else await sleep(250);
  }
  console.log('ext loaded:', extId || 'NO');
  if (!extId) throw new Error('extension never loaded');

  const openPanel = async () => {
    // create the panel page via the HTTP endpoint (PUT /json/new), no browser WS needed
    console.log('creating panel target via /json/new …');
    let page = null;
    for (let i = 0; i < 40 && !page; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extId}/sidepanel.html`, { method: 'PUT', signal: AbortSignal.timeout(3000) });
        page = await r.json();
      } catch (e) { await sleep(250); }
    }
    if (!page || !page.id) throw new Error('panel target missing: ' + JSON.stringify(page));
    console.log('panel target open:', page.id);
    // wait until it shows up in /json/list with a debugger URL
    let listed = null;
    for (let i = 0; i < 40 && !listed; i++) {
      listed = (await getJSON('/json/list')).find((t) => t.id === page.id && t.webSocketDebuggerUrl);
      if (!listed) await sleep(250);
    }
    if (!listed) throw new Error('panel never listed');
    const pws = new WebSocket(listed.webSocketDebuggerUrl, { handshakeTimeout: 5000 });
    await new Promise((res, rej) => { pws.on('open', res); pws.on('error', rej); });
    let pid = 0;
    const rawCall = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++pid;
      const on = (d) => { const m = JSON.parse(d); if (m.id === mid) { pws.off('message', on); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
      pws.on('message', on);
      pws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evalJs = (expression) => rawCall('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => r?.result?.value);
    return { evalJs, rawCall, close: () => pws.close() };
  };

  const panel = await openPanel();
  await sleep(1000);
  const whereRaw = await panel.rawCall('Runtime.evaluate', { expression: 'location.href', returnByValue: true, awaitPromise: true });
  console.log('raw evaluate:', JSON.stringify(whereRaw));
  const where = whereRaw?.result?.value;
  console.log('attached page:', where);
  if (!String(where).startsWith(`chrome-extension://${extId}/`)) {
    console.error('FATAL: attached to wrong page');
    process.exit(2);
  }
  console.log('panel attached, running tests…');

  // 1. initial state: lock visible
  check('initial: lock screen shown', await panel.evalJs(`!document.querySelector('#lock').classList.contains('hidden')`));

  // 2. wrong code must be rejected
  await panel.evalJs(`
    (async () => {
      const i = document.querySelector('#license-input');
      i.value = 'VS-20301231-XXXXXX';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#btn-activate').click();
      await new Promise(r => setTimeout(r, 600));
      return document.querySelector('#license-msg').textContent;
    })()
  `).then((msg) => check('wrong code rejected', /invalid|ไม่ถูกต้อง/i.test(String(msg)), `msg="${msg}"`));
  check('wrong code: lock still shown', await panel.evalJs(`!document.querySelector('#lock').classList.contains('hidden')`));

  // 3. valid code through the real UI
  await panel.evalJs(`
    (async () => {
      const i = document.querySelector('#license-input');
      i.value = ${JSON.stringify(CODE)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#btn-activate').click();
      await new Promise(r => setTimeout(r, 800));
      return JSON.stringify({
        msg: document.querySelector('#license-msg').textContent,
        lockHidden: document.querySelector('#lock').classList.contains('hidden'),
        exp: document.querySelector('#lic-exp').textContent,
      });
    })()
  `).then((raw) => {
    const r = JSON.parse(raw);
    check('valid code accepted', r.lockHidden === true, `msg="${r.msg}"`);
    check('expiry displayed', /ใช้ได้ถึง/.test(r.exp), r.exp);
  });

  // Verify the bundled Thai font is actually loaded before capture.
  check('Prompt Thai font loaded', await panel.evalJs(`(async () => {
    await document.fonts.load('14px Prompt', 'ภาษาไทย');
    await document.fonts.ready;
    return document.fonts.check('14px Prompt', 'ภาษาไทย') && getComputedStyle(document.body).fontFamily.includes('Prompt');
  })()`));
  check('persona wizard navigation and retained values', await panel.evalJs(`(() => {
    const cards = [...document.querySelectorAll('#tab-persona > .panel-card')];
    const shown = () => cards.findIndex(c => !c.classList.contains('wizard-inactive'));
    const input = document.querySelector('#persona-name');
    const old = input.value; input.value = 'ทดสอบตัวตน';
    if (shown() !== 0) return false;
    for (let i = 1; i < 4; i++) { document.querySelector('#persona-next').click(); if (shown() !== i) return false; }
    if (document.querySelector('#btn-gen-persona').closest('.action-bar').classList.contains('wizard-inactive')) return false;
    document.querySelector('#persona-prev').click();
    if (shown() !== 2) return false;
    document.querySelector('.persona-progress button').click();
    const ok = shown() === 0 && input.value === 'ทดสอบตัวตน'; input.value = old;
    return ok;
  })()`));
  check('hamburger navigation and Escape', await panel.evalJs(`(() => {
    const menu = document.querySelector('#studio-menu');
    const trigger = document.querySelector('.menu-trigger');
    if (!menu.hidden) return false;
    for (const tab of ['product','queue','settings','persona']) {
      trigger.click(); if (menu.hidden) return false;
      menu.querySelector('[data-tab="' + tab + '"]').click();
      if (!menu.hidden || !document.querySelector('#tab-' + tab).classList.contains('active')) return false;
    }
    trigger.click(); document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    return menu.hidden && document.title === 'bislator meta studio';
  })()`));
  // 4. unlocked panel screenshot
  const shot = await panel.rawCall('Page.captureScreenshot', { format: 'png' });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  await panel.evalJs(`document.querySelector('.menu-trigger').click()`);
  const menuShot = await panel.rawCall('Page.captureScreenshot', {format:'png'});
  writeFileSync(SHOT.replace(/\.png$/, '-menu.png'), Buffer.from(menuShot.data, 'base64'));
  await panel.evalJs(`document.querySelector('.menu-trigger').click()`);
  if (process.env.CAPTURE_TABS === '1') {
    for (const tab of ['persona', 'product', 'queue', 'settings']) {
      await panel.evalJs(`document.querySelector('[data-tab="${tab}"]').click()`);
      await sleep(350);
      check(`${tab} tab active`, await panel.evalJs(`document.querySelector('#tab-${tab}').classList.contains('active')`));
      const height = await panel.evalJs(`document.querySelector('#tab-${tab}').scrollHeight + 250`);
      await panel.rawCall('Emulation.setDeviceMetricsOverride', {width:500,height:Math.max(900,height),deviceScaleFactor:1,mobile:false});
      await panel.evalJs(`document.querySelector('.content').scrollTop = 0`);
      await sleep(200);
      const image = await panel.rawCall('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
      const dest = SHOT.replace(/\.png$/, `-${tab}.png`);
      writeFileSync(dest, Buffer.from(image.data, 'base64'));
      console.log('Saved:', dest);
    }
  }
  panel.close();

  // 5. persistence: brand-new panel must come up unlocked (same profile storage)
  const panel2 = await openPanel();
  await sleep(1000);
  check('persistence: new panel opens unlocked', await panel2.evalJs(`document.querySelector('#lock').classList.contains('hidden')`));
  check('persistence: expiry shown', await panel2.evalJs(`/ใช้ได้ถึง/.test(document.querySelector('#lic-exp').textContent)`),
    await panel2.evalJs(`document.querySelector('#lic-exp').textContent`));
  panel2.close();

  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  try { ws?.close(); } catch {}
  proc.kill('SIGKILL');
}
