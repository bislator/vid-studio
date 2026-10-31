// Job engine. Runs in the background service worker; all state lives in chrome.storage.local so the side panel can
// render it and the worker can be restarted at any time:
//   settings, status, batchOrder, batch:<id> (batch + its jobs and prompts), img:<id>:<role> (attached photos),
//   current (the job in flight), usedScenes (quick mode), failStreak, cooldownUntil
// Uses ONLY a meta.ai tab the user already has open (never opens or closes tabs). One job at a time: run it in that tab
// (meta_client.js, MAIN world), then save the image / video(s) through chrome.downloads.
// AI batches (persona / product) are queued without prompts: DeepSeek writes each set just before it is needed —
// the next set is written while Meta AI is still busy with the current one.

import { buildPrompts, pickScenes, pickHeadlines } from "./scenes.js";
import { imageMessage, videoMessage } from "./meta-prompts.js";
import { planBatch, writeSet, friendlyError, isFatalAiError } from "./promptgen/generate.js";
import { isActivated } from "./license.js";

// Swappable for tests.
export const deps = { isActivated };
const NO_LICENSE = "ยังไม่ได้เปิดใช้งาน หรือรหัสหมดอายุ — ใส่รหัสที่แผงด้านข้าง";

// deleteChats is off by default: deleting through the meta.ai sidebar slows every job down (user, 2026-10-04).
// (It replaced "cleanChats", which defaulted to on — a stored cleanChats value is ignored.)
export const DEFAULT_SETTINGS = { enabled: false, folder: "MetaAI-Videos", maxAttempts: 3, saveImage: false, deleteChats: false };
export const MAX_CLIPS = 50;
export const MAX_IMAGES = 300;
export const MODES = { persona: "ตัวตน", library: "คลังพรอมต์", product: "สินค้า", quick: "มือถือสินค้า" };

const MAX_RESTARTS = 2;
const RELOAD_WAIT_MS = 5 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_BYTES = { video: 100 * 1024, image: 10 * 1024 };
const COOLDOWN_MIN = [0, 0, 2, 5, 10]; // minutes to wait, indexed by consecutive failed jobs
const LOADING_HINT = "แท็บ meta.ai ยังโหลดไม่เสร็จ — เปิดแท็บนั้นให้เห็นบนจอ (อย่าย่อหรือบังหน้าต่าง Chrome)";
const BLUE = "#2563eb", GREEN = "#16a34a", AMBER = "#d97706", RED = "#dc2626", GREY = "#6b7280";

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);
const batchKey = (id) => "batch:" + id;
export const imageKey = (batchId, role) => `img:${batchId}:${role}`;

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await get("settings")).settings || {}) };
}

export async function loadBatches() {
  const { batchOrder = [] } = await get("batchOrder");
  const data = await get(batchOrder.map(batchKey));
  return batchOrder.map((id) => data[batchKey(id)]).filter(Boolean);
}

const saveBatch = (batch) => set({ [batchKey(batch.id)]: batch });

async function setStatus(text, badge, color = BLUE) {
  await set({ status: { text, badge, color, at: Date.now() } });
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// Everything that reads-then-writes state goes through this queue, so a side panel action never interleaves with a tick.
let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

const kick = () => setTimeout(() => tick(), 500);

// ---------- helpers ----------

// A Windows-safe single path segment.
export function safeName(name, fallback) {
  const s = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+|[. ]+$/g, "").slice(0, 50).trim();
  return s && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? s : fallback;
}

const pad = (n) => String(n).padStart(2, "0");

function stamp(ms) {
  const d = new Date(ms);
  return `${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function stageText(m) {
  const wait = /^(image|video|video 2): waiting \((\d+)s\)$/.exec(m || "");
  if (wait) return `รอ Meta AI สร้าง${{ image: "ภาพ", video: "วิดีโอ", "video 2": "วิดีโอท่อน 2" }[wait[1]]} (${wait[2]} วิ)`;
  const photo = /^attaching photo (\d+)\/(\d+)$/.exec(m || "");
  if (photo) return `แนบรูป ${photo[1]}/${photo[2]}`;
  return { started: "เริ่มงาน", "new chat": "เปิดแชทใหม่", "attaching photo": "แนบรูป", "image: generating": "สั่งสร้างภาพ",
    "video: generating": "สั่งสร้างวิดีโอ", "video 2: generating": "สั่งสร้างวิดีโอท่อน 2", saving: "กำลังบันทึกไฟล์", "deleting old chat": "ลบแชทเก่าใน meta.ai",
    "opening the chat": "Meta AI กลับไปหน้าแรก — เปิดแชทของงานนี้ให้" }[m] || m || "";
}

// Short human label for a job row.
function jobLabel(p, i) {
  const t = (p.headline || p.overlay || "").trim();
  if (t) return t;
  const img = String(p.image || "").replace(/\([^)]*\)/g, " ").replace(/^Ultra-realistic portrait photo\.?/i, "").replace(/\s+/g, " ").trim();
  return img ? img.slice(0, 90) : `ชุดที่ ${i}`;
}

// The user's own meta.ai tab — prefer the active one.
async function userMetaTab() {
  const tabs = await chrome.tabs.query({ url: ["https://www.meta.ai/*", "https://meta.ai/*"] });
  if (!tabs.length) return null;
  return tabs.find((t) => t.active) || tabs[0];
}

async function inMain(tabId, func, args = []) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return r ? r.result : undefined;
}

// Bring the (already open) meta.ai tab to the front of its window so the page can finish loading.
async function showTab(tab) {
  if (!tab.active) await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { drawAttention: true });
}

// ---------- functions injected into the meta.ai page (must be self-contained) ----------

// "login" | "busy" | "loading" | "ready". After a reload in a tab that is not visible on screen, meta.ai stays
// un-hydrated (no editor, links are plain <a href>) until the tab is shown, so "loading" can last until someone looks
// at it. "busy" = the Telegram video bot extension is running a clip in this tab.
function pageState() {
  if (/Log in|เข้าสู่ระบบ/.test((document.querySelector("main") || document.body).innerText.slice(0, 400))) return "login";
  if (window.__videoBot && Object.values(window.__videoBot).some((j) => j.status === "running")) return "busy";
  const link = [...document.querySelectorAll('a[href="/"]')].find((a) => /New chat|แชทใหม่/.test(a.innerText));
  const linkReady = !link || Object.keys(link).some((k) => k.startsWith("__react"));
  return document.querySelector('[data-lexical-editor][contenteditable="true"]') && linkReady ? "ready" : "loading";
}

function startJobInPage(job, files) {
  window.__metaStudio = window.__metaStudio || {};
  const st = (window.__metaStudio[job.id] = { status: "running", log: ["started"], result: null, error: null, abort: false, gone: [], chatUrl: "" });
  const log = (m) => { st.log.push(m); if (st.log.length > 50) st.log.shift(); };
  (async () => {
    const attachments = files.map((f) => ({
      blob: new Blob([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], { type: f.type }), name: f.name,
    }));
    st.result = await window.MetaStudioClient.runScene({
      attachments, imageMessage: job.imageMessage, videoMessages: job.videoMessages, log, aborted: () => st.abort,
      deleteChatIds: job.deleteChatIds || [], onDeleted: (id) => st.gone.push(id),
    });
    st.status = "done";
  })().catch((e) => {
    st.status = "error";
    st.error = String((e && e.message) || e);
    const chat = window.MetaStudioClient.currentChat && window.MetaStudioClient.currentChat();
    st.chatUrl = chat ? location.origin + chat : location.href; // a failed job's chat is cleaned up later too
  });
  return true;
}

function readJobInPage(jobId) {
  const st = window.__metaStudio && window.__metaStudio[jobId];
  return st ? JSON.parse(JSON.stringify(st)) : null;
}

function abortJobInPage(jobId) {
  const st = window.__metaStudio && window.__metaStudio[jobId];
  if (st) st.abort = true;
  return !!st;
}

// Fetch the mp4 inside the page (same cookies as the player) and hand it back as base64.
async function fetchVideoInPage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`video download ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// Meta AI serves images as WEBP; re-encode as JPEG (optionally shrunk) and hand back base64.
async function fetchImageJpegInPage(url, maxSide, quality) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`image download ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const buf = new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- prompt writing: one set at a time, one set ahead of Meta AI ----------

const MAX_PROMPT_TRIES = 3;
let writing = null; // id of the job DeepSeek is writing right now (this worker only; a restart just writes it again)

const needsPrompt = (j) => j.status === "queued" && !j.prompt;

function nextQueued(batches) {
  for (const batch of batches) {
    const job = batch.jobs.find((j) => j.status === "queued");
    if (job) return { batch, job };
  }
  return null;
}

// Have DeepSeek write the next set to run, if it has no prompt yet — never more than one set ahead.
function writeAhead(batches) {
  const next = nextQueued(batches);
  if (!writing && next && next.batch.ai && needsPrompt(next.job) && !(next.job.promptRetryAt > Date.now())) {
    startWriting(next.batch.id, next.job.id);
  }
}

// What earlier sets already used, so a set written on its own still doesn't repeat them.
function usedSoFar(batch) {
  const done = batch.jobs.filter((j) => j.prompt).slice(-8).map((j) => j.prompt);
  return {
    overlays: done.map((p) => p.overlay).filter(Boolean),
    headlines: done.map((p) => p.headline).filter(Boolean),
    lines: done.map((p) => ((/"([^"]+)"/.exec(p.video || "") || [])[1] || "").slice(0, 40)).filter(Boolean),
  };
}

function startWriting(batchId, jobId) {
  writing = jobId;
  (async () => {
    let result = null, error = null;
    try {
      const batch = (await get(batchKey(batchId)))[batchKey(batchId)];
      const job = batch && batch.jobs.find((j) => j.id === jobId);
      if (!job || !needsPrompt(job)) return;
      result = await writeSet(batch.ai.mode, batch.ai.fields, { recipe: job.recipe, category: batch.ai.category, look: batch.ai.look }, usedSoFar(batch));
    } catch (e) {
      error = e;
    }
    if (result || error) await locked(() => savePrompt(batchId, jobId, result, error));
  })().catch((e) => console.error(e)).finally(() => {
    writing = null;
    kick();
  });
}

async function savePrompt(batchId, jobId, result, error) {
  const batch = (await get(batchKey(batchId)))[batchKey(batchId)];
  const job = batch && batch.jobs.find((j) => j.id === jobId);
  if (!job || !needsPrompt(job)) return; // cancelled or deleted meanwhile
  if (result) {
    job.prompt = toPrompt(result);
    // Rows show the Thai headline/caption when there is one — never the English prompt.
    Object.assign(job, { label: job.prompt.headline || job.prompt.overlay || job.label, error: "", updated: Date.now() });
    return saveBatch(batch);
  }
  const msg = friendlyError(error);
  if (isFatalAiError(error)) { // a bad key or an empty balance: retrying would only burn the queue — stop and wait for the user
    job.error = `AI เขียนพรอมต์ไม่ได้: ${msg}`;
    await saveBatch(batch);
    await set({ settings: { ...(await getSettings()), enabled: false } });
    return setStatus(`AI เขียนพรอมต์ไม่ได้: ${msg} — แก้ที่แท็บ “ตั้งค่า” แล้วกด “เริ่มทำงาน”`, "ERR", RED);
  }
  const tries = (job.promptTries || 0) + 1;
  const final = tries >= MAX_PROMPT_TRIES;
  Object.assign(job, {
    status: final ? "failed" : "queued", promptTries: tries, promptRetryAt: Date.now() + 20000 * tries,
    error: `AI เขียนพรอมต์ไม่สำเร็จ (${tries}/${MAX_PROMPT_TRIES}): ${msg}`, updated: Date.now(),
  });
  await saveBatch(batch);
  await setStatus(`ชุดที่ ${job.index}: AI เขียนพรอมต์ไม่สำเร็จ (${tries}/${MAX_PROMPT_TRIES}) — ${msg}`, "ERR", RED);
}

// ---------- the loop ----------

export function tick() {
  return locked(async () => {
    try {
      await tickInner();
    } catch (e) {
      console.error(e);
      await setStatus(`ผิดพลาด: ${e.message || e}`, "ERR", RED);
    }
  });
}

async function tickInner() {
  const s = await getSettings();
  const { current } = await get("current");
  if (!current && !(await deps.isActivated())) return setStatus(NO_LICENSE, "KEY", RED); // a job already running may finish
  if (current) {
    await checkCurrent(current, s);
    // Meta AI is busy with this set: let DeepSeek write the next one meanwhile.
    if (s.enabled && (await deps.isActivated())) writeAhead(await loadBatches());
    return;
  }

  const batches = await loadBatches();
  // A job left "running" with nothing in flight (worker died mid-write): put it back in the queue.
  for (const b of batches) {
    const stuck = b.jobs.filter((j) => j.status === "running");
    if (stuck.length) {
      for (const j of stuck) Object.assign(j, { status: "queued", stage: "" });
      await saveBatch(b);
    }
  }
  const batch = batches.find((b) => b.jobs.some((j) => j.status === "queued"));
  if (!s.enabled) {
    // Stopped because DeepSeek refused the key / balance: keep saying so until the user fixes it.
    const blocked = batch && batch.jobs.find((j) => j.status === "queued" && !j.prompt && /^AI เขียนพรอมต์ไม่ได้/.test(j.error || ""));
    if (blocked) return setStatus(`${blocked.error} — แก้ที่แท็บ “ตั้งค่า” แล้วกด “เริ่มทำงาน”`, "ERR", RED);
    return setStatus(batch ? "หยุดอยู่ — กด “เริ่มทำงาน” เพื่อทำคิวต่อ" : "หยุดอยู่", "OFF", GREY);
  }
  if (!batch) {
    await pruneOldBatches(); // an older batch that just finished can go now
    return setStatus("ว่าง — ไม่มีงานในคิว", "ON", GREEN);
  }
  writeAhead(batches); // the first set's prompt can be written while the tab is still getting ready

  const { cooldownUntil = 0 } = await get("cooldownUntil");
  if (Date.now() < cooldownUntil) {
    const mins = Math.ceil((cooldownUntil - Date.now()) / 60000);
    return setStatus(`พักหลังสร้างไม่สำเร็จติดกัน — จะลองใหม่ในอีก ${mins} นาที`, "PAUSE", AMBER);
  }

  const tab = await userMetaTab();
  if (!tab) return setStatus("เปิดแท็บ meta.ai ค้างไว้ แล้วระบบจะเริ่มสร้าง", "TAB", AMBER);
  const state = await inMain(tab.id, pageState);
  if (state === "login") return setStatus("แท็บ meta.ai ยังไม่ได้ล็อกอิน", "LOGIN", RED);
  if (state === "busy") return setStatus("แท็บ meta.ai กำลังถูกบอท Telegram ใช้งานอยู่ — รอให้เสร็จก่อน", "WAIT", AMBER);
  if (state !== "ready") {
    await showTab(tab);
    return setStatus(LOADING_HINT, "WAIT", AMBER);
  }

  const job = batch.jobs.find((j) => j.status === "queued");
  const label = `${job.index}/${batch.total}`;
  if (!job.prompt) {
    const wait = Math.ceil(((job.promptRetryAt || 0) - Date.now()) / 1000);
    return wait > 0
      ? setStatus(`${label}: ให้ AI เขียนพรอมต์ใหม่ในอีก ${wait} วิ`, "WAIT", AMBER)
      : setStatus(`${label}: AI กำลังเขียนพรอมต์…`, "RUN");
  }
  Object.assign(job, { status: "running", attempts: job.attempts + 1, stage: "started", error: "", updated: Date.now() });
  await saveBatch(batch);
  await set({ current: { jobId: job.id, batchId: batch.id, tabId: tab.id, label, phase: "page", restarts: 0, startedAt: Date.now() } });
  try {
    await runInTab(tab.id, batch, job);
  } catch (e) {
    Object.assign(job, { status: "queued", attempts: job.attempts - 1, stage: "" });
    await saveBatch(batch);
    await chrome.storage.local.remove("current");
    throw e;
  }
  await setStatus(`กำลังสร้าง ${label} “${batch.name || batch.folder}” ในแท็บ Meta AI`, "RUN");
}

// Photos to attach for this job, in order. Once a "same face / same outfit as the first set" batch has its first image,
// that image is attached to every later job as the face, outfit or full-look reference (batch.fromFirst).
function attachmentsFor(batch, job) {
  const list = [...(batch.attachments || [])];
  if (batch.firstKey && batch.firstJobId !== job.id) list.push({ key: batch.firstKey, role: `prev-${batch.fromFirst}` });
  return list;
}

// What later jobs should copy from the first image: "face" | "outfit" | "look" | null. A part already locked by one of
// the user's own photos is never taken from the first image.
function normalizeFromFirst(fromFirst, attachments) {
  const has = (...roles) => attachments.some((a) => roles.includes(a.role));
  const face = ["face", "look"].includes(fromFirst) && !has("face", "look");
  const outfit = ["outfit", "look"].includes(fromFirst) && !has("outfit", "look");
  return face && outfit ? "look" : face ? "face" : outfit ? "outfit" : null;
}

const videoCount = (batch, job) => (batch.output === "image" ? 0 : job.prompt.video2 ? 2 : 1);

// ---------- meta.ai chat history: keep only the latest chat this extension made ----------
// metaChats = ids of chats this extension created, oldest first. Each new job deletes all but the newest one first.

const chatIdOf = (url) => (/\/prompt\/([\w-]+)/.exec(String(url || "")) || [])[1] || "";

async function rememberChat(url) {
  const id = chatIdOf(url);
  if (!id) return;
  const { metaChats = [] } = await get("metaChats");
  if (!metaChats.includes(id)) await set({ metaChats: [...metaChats, id].slice(-50) });
}

async function forgetChats(ids) {
  const { metaChats = [] } = await get("metaChats");
  const left = metaChats.filter((id) => !ids.includes(id));
  if (left.length !== metaChats.length) await set({ metaChats: left });
}

async function runInTab(tabId, batch, job) {
  const list = attachmentsFor(batch, job);
  const stored = await get(list.map((a) => a.key));
  const files = list.map((a, i) => {
    const img = stored[a.key];
    if (!img) throw new Error("ไม่พบรูปที่แนบไว้ของชุดนี้ (ลบชุดแล้วสร้างใหม่)");
    return { b64: img.b64, type: img.type, name: `${a.role}-${i + 1}.${img.type === "image/png" ? "png" : "jpg"}` };
  });
  const quick = batch.mode === "quick";
  const roles = list.map((a) => a.role);
  const motion = { quick, gender: batch.gender, person: batch.person !== false, product: roles.includes("product") };
  const videos = [job.prompt.video, job.prompt.video2].slice(0, videoCount(batch, job));
  const { metaChats = [] } = await get("metaChats");
  const deleteChatIds = (await getSettings()).deleteChats ? metaChats.slice(0, -1).slice(-10) : [];
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["meta_client.js"] });
  await inMain(tabId, startJobInPage, [{
    id: job.id,
    imageMessage: imageMessage(job.prompt.image, roles, quick),
    videoMessages: videos.map((v, i) => videoMessage(v, i + 1, motion)),
    deleteChatIds,
  }, files]);
}

async function checkCurrent(cur, s) {
  const batch = (await get(batchKey(cur.batchId)))[batchKey(cur.batchId)];
  const job = batch && batch.jobs.find((j) => j.id === cur.jobId);
  if (!job || job.status !== "running") { // cancelled or deleted from the side panel
    await chrome.storage.local.remove("current");
    return kick();
  }
  if (cur.phase === "download") return checkDownload(cur, batch, job, s);

  const st = await inMain(cur.tabId, readJobInPage, [cur.jobId]).catch(() => null);
  if (!st) return recoverLostJob(cur, batch, job, s);
  if (st.gone && st.gone.length) await forgetChats(st.gone);
  if (st.status === "running") {
    const limit = (10 + 12 * videoCount(batch, job)) * 60000;
    if (Date.now() - cur.startedAt > limit) {
      await inMain(cur.tabId, abortJobInPage, [cur.jobId]).catch(() => {});
      return failJob(cur, batch, job, s, `ใช้เวลานานเกิน ${limit / 60000} นาที`);
    }
    const last = st.log[st.log.length - 1];
    if (job.stage !== last) {
      job.stage = last;
      await saveBatch(batch);
    }
    return setStatus(`${cur.label}: ${stageText(last)}`, "RUN");
  }
  await rememberChat(st.status === "done" ? st.result && st.result.chatUrl : st.chatUrl);
  if (st.status === "done") return finishInPage(cur, batch, job, s, st.result);
  return failJob(cur, batch, job, s, st.error);
}

// The page no longer knows the job: the tab was closed, or meta.ai reloaded itself (a full reload happens on the next
// in-app navigation after meta.ai deploys a new version). If the tab is still there, run the job again in it once the
// page is ready, instead of counting a failed attempt.
async function recoverLostJob(cur, batch, job, s) {
  const tab = await chrome.tabs.get(cur.tabId).catch(() => null);
  const lostAt = cur.lostAt || Date.now();
  if (!tab || cur.restarts >= MAX_RESTARTS || Date.now() - lostAt > RELOAD_WAIT_MS) {
    return failJob(cur, batch, job, s, "แท็บ meta.ai ถูกปิดหรือรีโหลดระหว่างทำงาน");
  }
  const state = await inMain(cur.tabId, pageState).catch(() => null);
  if (state !== "ready") {
    await showTab(tab);
    await set({ current: { ...cur, lostAt } });
    return setStatus(`${cur.label}: ${state === "login" ? "แท็บ meta.ai ยังไม่ได้ล็อกอิน" : LOADING_HINT}`, "WAIT", AMBER);
  }
  await runInTab(cur.tabId, batch, job);
  const { lostAt: _, ...rest } = cur;
  await set({ current: { ...rest, restarts: cur.restarts + 1, startedAt: Date.now() } });
  await setStatus(`${cur.label}: หน้า Meta AI รีโหลด เริ่มทำใหม่ในแท็บเดิม`, "RUN");
}

async function failJob(cur, batch, job, s, error) {
  const final = job.attempts >= s.maxAttempts;
  Object.assign(job, { status: final ? "failed" : "queued", stage: "", error: String(error || "unknown error").slice(0, 300), updated: Date.now() });
  await saveBatch(batch);
  const failStreak = ((await get("failStreak")).failStreak || 0) + 1;
  const wait = COOLDOWN_MIN[Math.min(failStreak, COOLDOWN_MIN.length - 1)];
  await set({ failStreak, cooldownUntil: wait ? Date.now() + wait * 60000 : 0 });
  await chrome.storage.local.remove("current");
  await setStatus(`${cur.label} ไม่สำเร็จ (ครั้งที่ ${job.attempts}/${s.maxAttempts}): ${job.error}`, "ERR", RED);
  kick();
}

// ---------- saving the results ----------

// The generated image is still on screen: keep what later jobs need from it, then start the downloads.
async function finishInPage(cur, batch, job, s, result) {
  if (batch.fromFirst && !batch.firstKey && result.imageUrl) {
    try {
      const b64 = await inMain(cur.tabId, fetchImageJpegInPage, [result.imageUrl, 1536, 0.92]);
      const key = imageKey(batch.id, "first");
      await set({ [key]: { b64, type: "image/jpeg" } });
      Object.assign(batch, { firstKey: key, firstJobId: job.id });
    } catch (e) {
      console.warn("first-image reference not saved", e);
    }
  }
  if (!batch.thumb && result.imageUrl) {
    batch.thumb = await inMain(cur.tabId, fetchImageJpegInPage, [result.imageUrl, 120, 0.8]).then((b) => "data:image/jpeg;base64," + b, () => "");
  }

  const base = `${batch.folder}_${batch.stamp}_${pad(job.index)}`;
  const dir = `${safeName(s.folder, DEFAULT_SETTINGS.folder)}/${batch.folder}`;
  const downloads = [];
  for (let i = 0; i < result.videoUrls.length; i++) {
    const filename = `${dir}/${base}${i ? "_" + (i + 1) : ""}.mp4`;
    const id = await chrome.downloads.download({ url: result.videoUrls[i], filename, conflictAction: "uniquify", saveAs: false });
    downloads.push({ id, filename, kind: "video", url: result.videoUrls[i], via: "url" });
  }
  if ((batch.output === "image" || s.saveImage) && result.imageUrl) {
    const b64 = await inMain(cur.tabId, fetchImageJpegInPage, [result.imageUrl, 4096, 0.95]);
    const filename = `${dir}/${base}.jpg`;
    const id = await chrome.downloads.download({ url: "data:image/jpeg;base64," + b64, filename, conflictAction: "uniquify", saveAs: false });
    downloads.push({ id, filename, kind: "image", via: "page" });
  }
  job.stage = "saving";
  await saveBatch(batch);
  await set({ current: { ...cur, phase: "download", downloads, downloadAt: Date.now() } });
  await setStatus(`${cur.label}: กำลังบันทึกไฟล์`, "RUN");
}

async function checkDownload(cur, batch, job, s) {
  const items = cur.downloads;
  let pending = false;
  for (const item of items) {
    const [d] = await chrome.downloads.search({ id: item.id });
    if (d && d.state === "in_progress") {
      pending = true;
      continue;
    }
    const size = d && d.state === "complete" ? (d.fileSize > 0 ? d.fileSize : d.bytesReceived) : 0;
    if (d && d.state === "complete" && size >= MIN_BYTES[item.kind]) {
      item.file = d.filename.split(/[\\/]/).pop();
      continue;
    }
    if (d && d.state === "complete") await chrome.downloads.removeFile(d.id).catch(() => {});
    const reason = !d ? "download missing" : d.state === "complete" ? `ไฟล์เล็กผิดปกติ (${size} bytes)` : d.error || d.state;
    // Direct download of the video URL failed: fetch the bytes inside the page instead and save those.
    if (item.kind === "video" && item.via === "url") {
      try {
        const b64 = await inMain(cur.tabId, fetchVideoInPage, [item.url]);
        item.id = await chrome.downloads.download({ url: "data:video/mp4;base64," + b64, filename: item.filename, conflictAction: "uniquify", saveAs: false });
        item.via = "page";
        pending = true;
        continue;
      } catch (e) {
        return failJob(cur, batch, job, s, `บันทึกไฟล์ไม่สำเร็จ: ${reason} / ${e.message || e}`);
      }
    }
    return failJob(cur, batch, job, s, `บันทึกไฟล์ไม่สำเร็จ: ${reason}`);
  }
  if (pending) {
    await set({ current: { ...cur, downloads: items } });
    if (Date.now() - cur.downloadAt < DOWNLOAD_TIMEOUT_MS) return setStatus(`${cur.label}: กำลังบันทึกไฟล์`, "RUN");
    for (const item of items) await chrome.downloads.cancel(item.id).catch(() => {});
    return failJob(cur, batch, job, s, "บันทึกไฟล์ค้างเกิน 5 นาที");
  }
  const main = items.find((i) => i.kind === "video") || items[0];
  Object.assign(job, {
    status: "done", stage: "", error: "", files: items.map((i) => i.file), file: main ? main.file : "",
    downloadId: main ? main.id : null, updated: Date.now(),
  });
  await saveBatch(batch);
  await set({ failStreak: 0, cooldownUntil: 0 });
  await chrome.storage.local.remove("current");
  const left = batch.jobs.filter((j) => j.status === "queued").length;
  await setStatus(left ? `บันทึก ${cur.label} แล้ว` : `ชุด “${batch.name || batch.folder}” เสร็จแล้ว — บันทึก ${cur.label}`, "ON", GREEN);
  kick();
}

// The queue keeps only the newest batch (plus any batch still being made); finished older ones and their photos go.
// Saved clips in Downloads are not touched.
async function pruneOldBatches() {
  const { batchOrder = [] } = await get("batchOrder");
  if (batchOrder.length < 2) return;
  const newest = batchOrder[batchOrder.length - 1];
  const data = await get(batchOrder.map(batchKey));
  const busy = (id) => ((data[batchKey(id)] || {}).jobs || []).some((j) => j.status === "queued" || j.status === "running");
  const drop = batchOrder.filter((id) => id !== newest && !busy(id));
  if (!drop.length) return;
  const images = Object.keys(await get(null)).filter((k) => drop.some((id) => k.startsWith(`img:${id}:`)));
  await set({ batchOrder: batchOrder.filter((id) => !drop.includes(id)) });
  await chrome.storage.local.remove([...drop.map(batchKey), ...images]);
}

// ---------- actions from the side panel ----------

function toPrompt(set) {
  return {
    image: String(set.image_prompt || "").trim(),
    video: String(set.video_prompt || "").trim(),
    video2: String(set.video_prompt_2 || "").trim(),
    headline: String(set.headline || "").trim(),
    overlay: String(set.overlay || "").trim(),
  };
}

const actions = {
  // b = { id, mode, name, output, gender, attachments: [{key, role}], fromFirst: "face"|"outfit"|"look"|null, person, thumb,
  //       ai: { mode: "persona"|"product", fields }, count                         (DeepSeek writes each set later)
  //       sets: [{image_prompt, video_prompt, video_prompt_2, headline, overlay}]   (library: prompts ready now)
  //       quick: { count, hands, extra } }                                           (quick product mode)
  async addBatch({ batch: b }) {
    if (!(await deps.isActivated())) throw new Error(NO_LICENSE);
    const mode = MODES[b.mode] ? b.mode : "product";
    const attachments = (b.attachments || []).filter((a) => a && a.key && a.role);
    const stored = await get(attachments.map((a) => a.key));
    if (attachments.some((a) => !stored[a.key])) throw new Error("ไม่พบรูปที่แนบ ลองเลือกรูปใหม่");
    const { usedScenes = [], batchOrder = [] } = await get(["usedScenes", "batchOrder"]);
    const created = Date.now();
    const name = String(b.name || "").trim().slice(0, 80);
    let prompts;
    let used = null;
    let ai = null;
    if (b.ai) {
      if (!String((await get("apiKey")).apiKey || "").trim()) throw new Error("ยังไม่ได้ใส่ DeepSeek API Key (ไปที่แท็บ “ตั้งค่า”)");
      const count = Math.max(1, Math.min(MAX_CLIPS, Math.floor(Number(b.count)) || 1));
      const aiMode = b.ai.mode === "persona" ? "persona" : "product";
      const fields = b.ai.fields || {};
      const plan = planBatch(aiMode, fields, count); // scene recipes for every set, no API call
      ai = { mode: aiMode, fields, category: plan.category, look: plan.look };
      prompts = plan.recipes.map((recipe) => ({ recipe }));
    } else if (mode === "quick") {
      if (!attachments.some((a) => a.role === "product")) throw new Error("โหมดนี้ต้องมีรูปสินค้า");
      const q = b.quick || {};
      const count = Math.max(1, Math.min(MAX_CLIPS, Math.floor(Number(q.count)) || 1));
      const hands = ["any", "female", "male"].includes(q.hands) ? q.hands : "any";
      used = new Set(usedScenes);
      // minimal headline: the user's lines in turn, or random Thai hooks (no AI)
      const lines = Array.isArray(q.headlineLines) ? q.headlineLines.map((l) => String(l).trim().slice(0, 60)).filter(Boolean).slice(0, 50) : [];
      const heads = q.headline ? pickHeadlines(count, lines, name) : [];
      prompts = pickScenes(count, used, hands).map((key, i) => {
        const p = buildPrompts(key, name, q.extra || "", heads[i] || "");
        return { image: p.imagePrompt, video: p.videoPrompt, video2: "", headline: p.headline, overlay: "", label: p.label };
      });
    } else {
      const max = b.output === "image" ? MAX_IMAGES : MAX_CLIPS;
      prompts = (b.sets || []).slice(0, max).map(toPrompt).filter((p) => p.image);
      if (!prompts.length) throw new Error("ไม่มีพรอมต์ให้สร้าง");
    }
    const fallbackName = { persona: "ตัวตน", library: "คลังพรอมต์", product: "สินค้า", quick: "สินค้า" }[mode];
    const batch = {
      id: b.id, mode, name, folder: safeName(name, `${fallbackName}_${stamp(created)}`), stamp: stamp(created),
      output: b.output === "image" ? "image" : "video", gender: b.gender === "male" ? "male" : "female",
      attachments, fromFirst: normalizeFromFirst(b.fromFirst, attachments),
      person: mode === "quick" ? false : b.person !== false,
      ...(ai ? { ai } : {}),
      firstKey: null, firstJobId: null, thumb: b.thumb || "", created, total: prompts.length,
      jobs: prompts.map((p, i) => ({
        id: `${b.id}-${pad(i + 1)}`, index: i + 1,
        ...(p.recipe
          ? { label: `ชุดที่ ${i + 1}`, prompt: null, recipe: p.recipe }
          : { label: p.label || jobLabel(p, i + 1), prompt: { image: p.image, video: p.video, video2: p.video2, headline: p.headline, overlay: p.overlay } }),
        status: "queued", attempts: 0, stage: "", error: "", file: "", files: [], downloadId: null, updated: created,
      })),
    };
    await set({ [batchKey(batch.id)]: batch, batchOrder: [...batchOrder, batch.id], ...(used ? { usedScenes: [...used] } : {}) });
    await pruneOldBatches();
    return { id: batch.id, total: batch.total };
  },

  async cancelBatch({ id }) {
    const batch = (await get(batchKey(id)))[batchKey(id)];
    if (!batch) return;
    await stopRunning(batch);
    for (const j of batch.jobs) if (j.status === "queued" || j.status === "running") Object.assign(j, { status: "canceled", stage: "" });
    await saveBatch(batch);
  },

  async retryFailed({ id }) {
    const batch = (await get(batchKey(id)))[batchKey(id)];
    if (!batch) return;
    for (const j of batch.jobs) {
      if (j.status === "failed" || j.status === "canceled") Object.assign(j, { status: "queued", attempts: 0, error: "", promptTries: 0, promptRetryAt: 0 });
    }
    await saveBatch(batch);
    await set({ failStreak: 0, cooldownUntil: 0 });
  },

  async deleteBatch({ id }) {
    const batch = (await get(batchKey(id)))[batchKey(id)];
    if (batch) await stopRunning(batch);
    const { batchOrder = [] } = await get("batchOrder");
    const images = Object.keys(await get(null)).filter((k) => k.startsWith(`img:${id}:`));
    await set({ batchOrder: batchOrder.filter((x) => x !== id) });
    await chrome.storage.local.remove([batchKey(id), ...images]);
  },

  async setEnabled({ enabled }) {
    await set({ settings: { ...(await getSettings()), enabled: !!enabled } });
    if (enabled) await set({ failStreak: 0, cooldownUntil: 0 });
  },

  async saveSettings({ settings }) {
    const cur = await getSettings();
    await set({
      settings: {
        ...cur,
        folder: safeName(settings.folder, DEFAULT_SETTINGS.folder),
        maxAttempts: Math.max(1, Math.min(5, Math.floor(Number(settings.maxAttempts)) || DEFAULT_SETTINGS.maxAttempts)),
        saveImage: !!settings.saveImage,
        deleteChats: settings.deleteChats === true,
      },
    });
  },

  async resetScenes() {
    await set({ usedScenes: [] });
  },

  async tick() {},
};

// Stop the in-flight job if it belongs to this batch.
async function stopRunning(batch) {
  const { current } = await get("current");
  if (!current || current.batchId !== batch.id) return;
  if (current.phase === "download") for (const d of current.downloads || []) await chrome.downloads.cancel(d.id).catch(() => {});
  else await inMain(current.tabId, abortJobInPage, [current.jobId]).catch(() => {});
  await chrome.storage.local.remove("current");
}

export async function handle(msg) {
  const action = msg && actions[msg.type];
  if (!action) throw new Error(`unknown action: ${msg && msg.type}`);
  const result = await locked(() => action(msg));
  await tick();
  return result;
}
