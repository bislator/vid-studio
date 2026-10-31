// Side panel UI. The forms hand a batch to the background engine, which has DeepSeek write each set (one set ahead)
// and runs it in the user's meta.ai tab. Queue state is read straight from chrome.storage.local; every queue change
// goes through the engine (chrome.runtime.sendMessage).
import { DEFAULT_SETTINGS, MAX_CLIPS, MODES, stageText, imageKey } from "./lib/engine.js";
import { sceneCount } from "./lib/scenes.js";
import { librarySets, detectCategory, MAX_SETS, MAX_LIBRARY } from "./lib/promptgen/generate.js";
import { comboCount } from "./lib/promptgen/library-engine.js";
import { DEFAULT_MODEL, DEFAULT_BASE, endpointFrom } from "./lib/promptgen/llm.js";
import { lockText, batchRoles, ROLE_TH } from "./lib/meta-prompts.js";
import * as license from "./lib/license.js";

const $ = (id) => document.getElementById(id);
// Radio-chip groups: the checked value / check one.
const pick = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value ?? "";
const choose = (name, value) => { const el = document.querySelector(`input[name="${name}"][value="${value}"]`); if (el) el.checked = true; };
const option = (name, value) => document.querySelector(`input[name="${name}"][value="${value}"]`);
const MAX_SIDE = 2048;
const MAX_BYTES = 4 * 1024 * 1024;
const STATUS_TH = { queued: "รอคิว", running: "กำลังทำ", done: "เสร็จ", failed: "ล้มเหลว", canceled: "ยกเลิก" };
const OUTPUT_TH = { video: "ภาพ + วิดีโอ", image: "ภาพอย่างเดียว" };
const PROVIDERS = {
  deepseek: { baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL, keyStore: "keyDeepseek" },
  local: { baseUrl: "http://localhost:11434/v1", model: "qwen3:30b-instruct", keyStore: "keyLocal" },
};
const IC = {
  photo: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
};

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function send(msg) {
  const r = await chrome.runtime.sendMessage(msg);
  if (!r || !r.ok) throw new Error((r && r.error) || "ส่วนเบื้องหลังไม่ตอบ ลองปิดแล้วเปิดแผงใหม่");
  return r.result;
}

const intIn = (el, min, max) => Math.max(min, Math.min(max, Math.floor(Number(el.value)) || min));
const randomId = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---------- tabs ----------

function showTab(name) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  updateKeyBanner();
}
document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
const activeTab = () => document.querySelector(".nav-item.active").dataset.tab;

// ---------- photo slots ----------

const canvasBlob = (canvas, type, quality) => new Promise((res) => canvas.toBlob(res, type, quality));
const dataUrl = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});

function draw(bmp, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; // JPEG has no alpha
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  return c;
}

// File -> { b64, type, thumb, info }. Large files and WEBP are re-encoded as JPEG (Meta AI's uploader is pickier).
async function readPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("รองรับเฉพาะรูป JPG / PNG / WEBP");
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("เปิดไฟล์รูปนี้ไม่ได้");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  let blob = file;
  if (scale < 1 || file.size > MAX_BYTES || file.type === "image/webp") blob = await canvasBlob(draw(bmp, w, h), "image/jpeg", 0.92);
  const t = 120 / Math.max(bmp.width, bmp.height);
  const thumb = draw(bmp, Math.max(1, Math.round(bmp.width * t)), Math.max(1, Math.round(bmp.height * t))).toDataURL("image/jpeg", 0.8);
  const url = await dataUrl(blob);
  return { b64: url.slice(url.indexOf(",") + 1), type: blob.type, thumb, preview: url, info: `${w}×${h} · ${(blob.size / 1024).toFixed(0)} KB` };
}

const slots = {};
let lastSlot = null;

function makeSlot(el) {
  const title = el.dataset.title;
  el.innerHTML = `<div class="dropzone" tabindex="0" role="button" aria-label="เลือก${esc(title)}">
      <input type="file" accept="image/jpeg,image/png,image/webp" hidden />
      <div class="drop-empty">${IC.photo}<div><b>${esc(title)}</b>คลิกเพื่อเลือก · ลากมาวาง · Ctrl+V</div></div>
      <div class="drop-preview hidden"><img alt="" /><div class="preview-info"><div class="preview-name"></div><div class="small size"></div>
        <button class="btn-mini" type="button">เปลี่ยนรูป</button></div></div>
    </div>`;
  const dz = el.querySelector(".dropzone"), input = el.querySelector("input");
  const slot = {
    el,
    data: null,
    visible: () => el.offsetParent !== null,
    setTitle(t) {
      el.querySelector(".drop-empty b").textContent = t;
      dz.setAttribute("aria-label", "เลือก" + t);
    },
    async set(file) {
      if (!file) return;
      try {
        slot.data = await readPhoto(file);
      } catch (e) {
        return toast(e.message);
      }
      el.querySelector("img").src = slot.data.preview;
      el.querySelector(".preview-name").textContent = file.name || "รูปที่วาง";
      el.querySelector(".size").textContent = slot.data.info;
      el.querySelector(".drop-empty").classList.add("hidden");
      el.querySelector(".drop-preview").classList.remove("hidden");
      el.classList.remove("missing");
      el.dispatchEvent(new Event("slotchange", { bubbles: true }));
    },
    clear() {
      slot.data = null;
      input.value = "";
      el.querySelector(".drop-preview").classList.add("hidden");
      el.querySelector(".drop-empty").classList.remove("hidden");
      el.dispatchEvent(new Event("slotchange", { bubbles: true }));
    },
  };
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => slot.set(input.files[0]));
  for (const ev of ["dragenter", "dragover"]) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); });
  dz.addEventListener("drop", (e) => slot.set([...e.dataTransfer.files].find((f) => f.type.startsWith("image/"))));
  for (const ev of ["pointerenter", "focusin"]) el.addEventListener(ev, () => (lastSlot = slot));
  slots[el.dataset.slot] = slot;
}
document.querySelectorAll(".slot").forEach(makeSlot);

// Ctrl+V: the slot last pointed at, else the first empty visible slot in the open tab.
document.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
  if (!f || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) && !document.activeElement.closest(".slot")) return;
  const visible = Object.values(slots).filter((s) => s.visible());
  const target = (lastSlot && lastSlot.visible() && lastSlot) || visible.find((s) => !s.data) || visible[0];
  if (target) target.set(f);
});

// ---------- small controls ----------

// −/+ buttons next to the count inputs.
document.addEventListener("click", (e) => {
  const b = e.target.closest(".step");
  if (!b) return;
  const input = $(b.dataset.for);
  const min = Number(input.min) || 1, max = Number(input.max) || 50;
  input.value = Math.max(min, Math.min(max, (Math.floor(Number(input.value)) || min) + Number(b.dataset.step)));
});

// ---------- face / outfit lock (shared by both forms) ----------
// face: none | first | library (product only) | photo · outfit: free | first | photo | face_photo

const FACE_NOTE = {
  none: "แต่ละชุดเป็นคนละคน",
  first: "<b>คนเดิมทุกชุด</b> — ภาพชุดแรกเป็นต้นแบบหน้าให้ชุดถัดไป",
  library: "<b>คนเดิมทุกชุด</b> — สุ่มลุคอินฟลูไทย แล้วใช้ภาพชุดแรกเป็นต้นแบบหน้า",
  photo: "<b>ล็อกตามรูปหน้า</b> — คนเดียวกันทุกชุด",
};
const OUTFIT_NOTE = {
  free: "เปลี่ยนตามธีม / ฉาก",
  first: "<b>ชุดเดิมทุกชุด</b> — ใช้ชุดจากภาพชุดแรก",
  photo: "<b>ใส่ตามรูปชุดเป๊ะ</b> — ทรง สี ลาย เครื่องประดับ",
  face_photo: "<b>ชุดเดียวกับในรูปหน้า</b> — แนบรูปคนเต็มตัว",
};

// What to attach and what to copy from the first generated image.
function lockPlan(prefix) {
  const face = pick(`${prefix}-face`), outfit = pick(`${prefix}-outfit`);
  const attachments = [];
  if (face === "photo") attachments.push({ role: outfit === "face_photo" ? "look" : "face", slot: slots[`${prefix}-face`] });
  if (outfit === "photo") attachments.push({ role: "outfit", slot: slots[`${prefix}-outfit`] });
  const faceFirst = face === "first" || face === "library", outfitFirst = outfit === "first";
  const fromFirst = faceFirst && outfitFirst ? "look" : faceFirst ? "face" : outfitFirst ? "outfit" : null;
  return { face, outfit, attachments, fromFirst };
}

const photoList = (roles) => roles.map((r, i) => `รูป ${i + 1} = ${ROLE_TH[r] || r}`).join(" · ");

// Show the right photo slots and explain, in plain Thai, what Meta AI will get. lead = roles attached before the
// person photos (the product photo).
function syncLock(prefix, lead = [], person = true) {
  const fp = option(`${prefix}-outfit`, "face_photo");
  fp.disabled = pick(`${prefix}-face`) !== "photo";
  if (fp.disabled && fp.checked) choose(`${prefix}-outfit`, "free");
  const plan = lockPlan(prefix);
  const faceSlot = slots[`${prefix}-face`];
  faceSlot.el.classList.toggle("hidden", !person || plan.face !== "photo");
  faceSlot.setTitle(plan.outfit === "face_photo" ? "รูปคนเต็มตัว — เห็นหน้าและชุดชัด" : faceSlot.el.dataset.title);
  slots[`${prefix}-outfit`].el.classList.toggle("hidden", !person || plan.outfit !== "photo");

  const first = [...lead, ...(person ? plan.attachments.map((a) => a.role) : [])];
  const later = person ? batchRoles(first.map((role) => ({ role })), plan.fromFirst, true) : first;
  const lines = [];
  if (person) lines.push(`👤 หน้า: ${FACE_NOTE[plan.face]}`, `👗 ชุด: ${OUTFIT_NOTE[plan.outfit]}`);
  if (first.length) lines.push(`📎 ส่งให้ Meta AI: ${photoList(first)}`);
  if (later.length > first.length) {
    lines.push(`➕ ชุดที่ 2 เป็นต้นไป: ${later.slice(first.length).map((r, i) => `รูป ${first.length + i + 1} = ${ROLE_TH[r]}`).join(" · ")}`);
  }
  $(`${prefix}-lock-note`).innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
  const preview = $(`${prefix}-lock-preview`);
  const roles = later.length ? later : first;
  preview.classList.toggle("hidden", !roles.length);
  preview.querySelector(".block-body").textContent = roles.length ? lockText(roles) + " Description: …" : "";
  return plan;
}

// Every chosen photo slot must have a photo.
function missingPhotos(attachments) {
  const missing = attachments.filter((a) => !a.slot.data);
  missing.forEach((a) => a.slot.el.classList.add("missing"));
  return missing.length > 0;
}

// ---------- persona form ----------

function syncPersona() {
  const lib = $("persona-lib-toggle").checked;
  $("persona-count").max = lib ? MAX_LIBRARY : MAX_SETS;
  for (const id of ["persona-ai-fields", "persona-overlay-field"]) $(id).classList.toggle("off", lib);
  const gv = pick("persona-gender");
  $("persona-lib-note").classList.toggle("hidden", !lib);
  $("persona-lib-note").textContent = lib
    ? `คลัง${gv === "male" ? "ผู้ชาย" : "ผู้หญิง"}: สุ่มผสมได้ ~${comboCount(gv).toLocaleString()} แบบ · สูงสุด ${MAX_LIBRARY}/รอบ · วิดีโอจะขยับท่าทางธรรมชาติ · ไม่ใช้ API`
    : "";
  const plan = syncLock("persona");
  $("persona-skin-field").classList.toggle("off", plan.face === "photo"); // skin comes from the face photo
  updateKeyBanner();
}
$("tab-persona").addEventListener("change", syncPersona);
$("tab-persona").addEventListener("slotchange", syncPersona);

$("btn-gen-persona").addEventListener("click", () => {
  const useLibrary = $("persona-lib-toggle").checked;
  const name = $("persona-name").value.trim();
  if (!useLibrary && !name) return toast("กรุณากรอกชื่อ/คาแรกเตอร์");
  const plan = lockPlan("persona");
  if (missingPhotos(plan.attachments)) return toast("เลือกรูปที่จะใช้ล็อกก่อน หรือเปลี่ยนตัวเลือกล็อก");
  const count = intIn($("persona-count"), 1, useLibrary ? MAX_LIBRARY : MAX_SETS);
  const output = pick("persona-output");
  const fields = {
    name,
    gender: pick("persona-gender"),
    skinTone: $("persona-skin").value,
    theme: $("persona-theme").value,
    details: $("persona-details").value.trim(),
    is16s: $("persona-16s-toggle").checked,
    faceLock: plan.face,
    outfitLock: plan.outfit,
    overlayText: $("persona-overlay-text").value.trim(),
    aiOverlay: $("persona-overlay-ai").checked,
    forVideo: output !== "image", // talking clip: frame the face large and front-on
  };
  const ctx = {
    mode: useLibrary ? "library" : "persona",
    name: useLibrary ? (name || `คลัง${fields.gender === "male" ? "ผู้ชาย" : "ผู้หญิง"}`) : name,
    gender: fields.gender,
    attachments: plan.attachments.map((a) => ({ role: a.role, data: a.slot.data })),
    fromFirst: plan.fromFirst,
    person: true,
  };
  // The library needs no AI: its prompts are ready now. Otherwise DeepSeek writes each set while the queue runs.
  submit(ctx, output, useLibrary ? { sets: librarySets(fields, count) } : { ai: { mode: "persona", fields }, count });
});

// ---------- product form ----------

let detectTimer = null;
function scheduleDetect() {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(() => {
    const text = `${$("product-name").value} ${$("product-details").value}`.trim();
    const ind = $("cat-indicator");
    if (!text || pick("product-style") === "quick") return ind.classList.add("hidden");
    const r = detectCategory(text);
    ind.classList.remove("hidden");
    ind.className = r.generic ? "cat-indicator warn" : "cat-indicator ok";
    ind.textContent = r.generic
      ? "⚠️ ยังจับหมวดสินค้าไม่ได้ — AI จะคิดฉากเอง (แนะนำกรอกรายละเอียดเพิ่ม)"
      : `✅ หมวด: ${r.label} — ระบบล็อกฉากให้สมจริง`;
  }, 300);
}
$("product-name").addEventListener("input", scheduleDetect);
$("product-details").addEventListener("input", scheduleDetect);

const showsPerson = (style) => !["hands", "warehouse", "tabletop", "quick"].includes(style);

function syncProduct() {
  const style = pick("product-style");
  const quick = style === "quick";
  $("product-ai-fields").classList.toggle("hidden", quick);
  $("quick-hands-field").classList.toggle("hidden", !quick);
  $("quick-headline-text").classList.toggle("off", !$("quick-headline-toggle").checked);
  $("product-presenter").classList.toggle("hidden", quick);
  $("product-details-hint").textContent = quick
    ? `โหมดนี้ใช้ช่องนี้เป็น “คำสั่งเพิ่มเติมสำหรับภาพ” (ไม่บังคับ) — ฉาก + มือสุ่มจากคลัง ~${(sceneCount() / 1e9).toFixed(0)} พันล้านแบบ ไม่ซ้ำ`
    : "ยิ่งกรอกละเอียด ฉาก/จุดขายยิ่งตรง — เว้นว่าง ระบบจะคิดฉากให้เอง";
  const person = showsPerson(style);
  $("product-lock-fields").classList.toggle("hidden", !person);
  $("product-gender-label").textContent = person ? "เพศพรีเซ็นเตอร์ / เสียงพากย์" : "เพศเสียงพากย์ (สไตล์นี้ไม่เห็นหน้าคน)";
  syncLock("product", slots["product-photo"].data ? ["product"] : [], person);
  scheduleDetect();
  updateKeyBanner();
}
$("tab-product").addEventListener("change", syncProduct);
$("tab-product").addEventListener("slotchange", syncProduct);

$("btn-gen-product").addEventListener("click", () => {
  const name = $("product-name").value.trim();
  const style = pick("product-style");
  const photo = slots["product-photo"].data;
  const output = pick("product-output");
  const count = intIn($("product-count"), 1, MAX_CLIPS);
  if (style === "quick") {
    if (!photo) {
      slots["product-photo"].el.classList.add("missing");
      return toast("โหมดนี้ต้องมีรูปสินค้า");
    }
    const ctx = { mode: "quick", name, gender: "female", attachments: [{ role: "product", data: photo }], fromFirst: null, person: false };
    const headline = $("quick-headline-toggle").checked;
    const headlineLines = $("quick-headline-text").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return submit(ctx, output, { quick: { count, hands: pick("quick-hands"), extra: $("product-details").value.trim(), headline, headlineLines } });
  }
  if (!name) return toast("กรุณากรอกชื่อสินค้า");
  const person = showsPerson(style);
  const plan = person ? lockPlan("product") : { face: "none", outfit: "free", attachments: [], fromFirst: null };
  if (missingPhotos(plan.attachments)) return toast("เลือกรูปที่จะใช้ล็อกก่อน หรือเปลี่ยนตัวเลือกล็อก");
  const gender = pick("product-gender");
  if (!gender && (plan.face !== "none" || plan.outfit !== "free")) {
    return toast("เลือกเพศพรีเซ็นเตอร์ก่อน — ใช้กำหนดเสียงพากย์ให้ตรงกับคนในภาพ");
  }
  const fields = {
    name,
    details: $("product-details").value.trim(),
    style: style === "auto" ? "" : style,
    is16s: $("product-16s-toggle").checked,
    hasProductRef: !!photo,
    withHeadline: $("product-headline-toggle").checked,
    gender,
    faceLock: plan.face,
    presenterAge: $("product-age").value.trim(), // "55" or "ห้าสิบห้า" — the presenter looks this age
    outfitLock: plan.outfit,
    forVideo: output !== "image", // talking clip: presenter's face large and front-on
  };
  const attachments = [];
  if (photo) attachments.push({ role: "product", data: photo });
  for (const a of plan.attachments) attachments.push({ role: a.role, data: a.slot.data });
  const ctx = { mode: "product", name, gender: gender || "female", attachments, fromFirst: plan.fromFirst, person };
  submit(ctx, output, { ai: { mode: "product", fields }, count });
});

// ---------- send to the queue ----------

let busy = false;

// Store the photos under the new batch's id, hand the batch to the engine and start the queue.
async function submit(ctx, output, extra) {
  if (busy) return;
  if (extra.ai && !hasKey) {
    toast("ใส่ DeepSeek API Key ที่แท็บ “ตั้งค่า” ก่อน");
    return showTab("settings");
  }
  busy = true;
  try {
    const id = randomId();
    const attachments = ctx.attachments.map((a) => ({ key: imageKey(id, a.role), role: a.role }));
    await chrome.storage.local.set(Object.fromEntries(ctx.attachments.map((a) => [imageKey(id, a.role), { b64: a.data.b64, type: a.data.type }])));
    const thumb = (ctx.attachments.find((a) => a.role === "product") || ctx.attachments[0] || {}).data?.thumb || "";
    const r = await send({
      type: "addBatch",
      batch: { id, mode: ctx.mode, name: ctx.name, output, gender: ctx.gender, attachments, fromFirst: ctx.fromFirst, person: ctx.person, thumb, ...extra },
    });
    await send({ type: "setEnabled", enabled: true });
    if (ctx.mode === "quick") slots["product-photo"].clear();
    toast(`ส่งเข้าคิว ${r.total} ชุดแล้ว${extra.ai ? " — AI เขียนพรอมต์ทีละชุดระหว่างสร้าง" : ""}`);
    showTab("queue");
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
}

// ---------- queue ----------

const openBatches = new Set();
let state = { settings: DEFAULT_SETTINGS, status: null, batches: [], usedScenes: 0 };

// Storage can change again while a read is in flight; re-read until nothing changed meanwhile so the last write wins.
let loading = null, stale = false;
function load() {
  stale = true;
  loading ||= (async () => {
    while (stale) {
      stale = false;
      const { settings, status, batchOrder = [], usedScenes = [] } = await chrome.storage.local.get(["settings", "status", "batchOrder", "usedScenes"]);
      const data = await chrome.storage.local.get(batchOrder.map((id) => "batch:" + id));
      state = {
        settings: { ...DEFAULT_SETTINGS, ...(settings || {}) },
        status,
        usedScenes: usedScenes.length,
        batches: batchOrder.map((id) => data["batch:" + id]).filter(Boolean),
      };
    }
    loading = null;
    render();
  })();
  return loading;
}

const count = (batch, status) => batch.jobs.filter((j) => j.status === status).length;

function jobRow(j) {
  const text = j.status === "done" ? (j.files && j.files.length ? j.files.join(" · ") : j.file)
    : j.status === "running" ? stageText(j.stage) || j.label
    : j.status === "failed" || (j.status === "queued" && j.error)
      ? `${j.error}${j.status === "queued" && j.prompt ? ` (จะลองใหม่ ครั้งที่ ${j.attempts + 1})` : ""}`
    : j.status === "queued" && !j.prompt ? `${j.label} · รอ AI เขียนพรอมต์`
    : j.label;
  const open = j.status === "done" && j.downloadId != null
    ? `<button class="btn-mini" data-act="show" data-download="${j.downloadId}">เปิด</button>` : "";
  return `<div class="job">
    <span class="job-no">#${String(j.index).padStart(2, "0")}</span>
    <span class="chip ${j.status}">${STATUS_TH[j.status] || j.status}</span>
    <span class="job-text${j.error && j.status !== "done" ? " err" : ""}" title="${esc(text)}">${esc(text)}</span>${open}
  </div>`;
}

function batchCard(b) {
  const done = count(b, "done"), failed = count(b, "failed"), queued = count(b, "queued"), running = count(b, "running"), canceled = count(b, "canceled");
  const parts = [`เสร็จ ${done}/${b.total}`];
  if (queued) parts.push(`รอ ${queued}`);
  if (failed) parts.push(`ล้มเหลว ${failed}`);
  if (canceled) parts.push(`ยกเลิก ${canceled}`);
  const pct = (n) => `${(n / b.total) * 100}%`;
  const chip = running ? ["running", "กำลังทำ"] : queued ? ["queued", "รอคิว"] : failed || canceled ? ["failed", "ไม่ครบ"] : ["done", "เสร็จครบ"];
  const lastDone = [...b.jobs].reverse().find((j) => j.status === "done" && j.downloadId != null);
  const actions = [
    lastDone ? `<button class="btn-mini" data-act="show" data-download="${lastDone.downloadId}">เปิดโฟลเดอร์</button>` : "",
    failed || canceled ? `<button class="btn-mini" data-act="retryFailed" data-id="${b.id}">ทำใหม่ ${failed + canceled} ชุด</button>` : "",
    queued || running ? `<button class="btn-mini danger" data-act="cancelBatch" data-id="${b.id}">ยกเลิกที่เหลือ</button>` : "",
    `<button class="btn-mini danger" data-act="deleteBatch" data-id="${b.id}">ลบ</button>`,
  ].join("");
  const kind = `${MODES[b.mode] || ""} · ${OUTPUT_TH[b.output || "video"]}`;
  return `<div class="batch">
    <div class="batch-head">
      ${b.thumb ? `<img class="thumb" src="${esc(b.thumb)}" alt="" />` : `<div class="thumb"></div>`}
      <div class="batch-title"><strong title="${esc(b.name || b.folder)}">${esc(b.name || b.folder)}</strong><span class="small">${kind}<br>${parts.join(" · ")}</span></div>
      <span class="chip ${chip[0]}">${chip[1]}</span>
    </div>
    <div class="bar"><div class="bar-done" style="width:${pct(done)}"></div><div class="bar-run" style="width:${pct(running)}"></div><div class="bar-fail" style="width:${pct(failed)}"></div></div>
    <div class="batch-actions">${actions}</div>
    <details class="jobs" data-id="${b.id}"${openBatches.has(b.id) ? " open" : ""}>
      <summary>รายการ (${b.total})</summary>
      ${b.jobs.map(jobRow).join("")}
    </details>
  </div>`;
}

function renderStatus() {
  const st = state.status;
  $("status-badge").textContent = st ? st.badge : "—";
  $("status-pill").title = st ? st.text : "";
  $("status-dot").style.background = st ? st.color : "";
  $("engine-card").style.borderLeftColor = st ? st.color : "";
  $("engine-status").textContent = st ? st.text : "ยังไม่เริ่ม";
  const sec = st ? Math.max(0, Math.round((Date.now() - st.at) / 1000)) : 0;
  $("engine-ago").textContent = st ? (sec < 5 ? "อัปเดตเมื่อสักครู่" : `อัปเดตเมื่อ ${sec < 90 ? sec + " วินาที" : Math.round(sec / 60) + " นาที"}ที่แล้ว`) : "";
}

function render() {
  renderStatus();
  const { settings, batches } = state;
  const btn = $("btn-toggle");
  btn.textContent = settings.enabled ? "หยุดชั่วคราว" : "เริ่มทำงาน";
  btn.classList.toggle("stop", settings.enabled);
  const pending = batches.reduce((n, b) => n + count(b, "queued") + count(b, "running"), 0);
  $("queue-count").textContent = pending;
  $("queue-count").classList.toggle("hidden", !pending);
  const html = [...batches].reverse().map(batchCard).join("");
  if (html !== render.html) $("batches").innerHTML = render.html = html; // status-only updates leave the list (and focus) alone
  $("queue-empty").classList.toggle("hidden", batches.length > 0);
  $("set-folder-echo").textContent = settings.folder;
  $("scene-usage").textContent = `ใช้ไปแล้ว ${state.usedScenes.toLocaleString()} จาก ${sceneCount().toLocaleString()} ฉาก — ฉากที่เคยใช้จะไม่ถูกสุ่มซ้ำจนกว่าจะล้างประวัติ`;
}

$("batches").addEventListener("toggle", (e) => {
  const d = e.target.closest("details.jobs");
  if (d) d.open ? openBatches.add(d.dataset.id) : openBatches.delete(d.dataset.id);
}, true);

$("batches").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "show") return chrome.downloads.show(Number(b.dataset.download));
  if (act === "deleteBatch" && !confirm("ลบชุดนี้ออกจากรายการ? (ไฟล์ที่บันทึกแล้วยังอยู่ในเครื่อง)")) return;
  try {
    await send({ type: act, id: b.dataset.id });
    if (act === "retryFailed") await send({ type: "setEnabled", enabled: true });
  } catch (err) {
    toast(err.message);
  }
});

$("btn-toggle").addEventListener("click", () => send({ type: "setEnabled", enabled: !state.settings.enabled }).catch((e) => toast(e.message)));
$("btn-open-meta").addEventListener("click", () => chrome.tabs.create({ url: "https://www.meta.ai/" }));
document.addEventListener("click", (e) => { if (e.target.closest(".js-go-queue")) showTab("queue"); });

// ---------- settings: AI ----------

let hasKey = false;

function updateKeyBanner() {
  const tab = activeTab();
  const needsAi = (tab === "persona" && !$("persona-lib-toggle").checked) || (tab === "product" && pick("product-style") !== "quick");
  $("key-banner").classList.toggle("hidden", hasKey || !needsAi);
}
$("go-settings").addEventListener("click", () => showTab("settings"));

async function loadAi() {
  const s = await chrome.storage.local.get(["apiKey", "model", "baseUrl", "provider"]);
  $("provider-select").value = PROVIDERS[s.provider] ? s.provider : "deepseek";
  $("base-url").value = s.baseUrl || DEFAULT_BASE;
  $("model-select").value = s.model || DEFAULT_MODEL;
  $("api-key").value = s.apiKey || "";
  hasKey = !!s.apiKey;
  $("api-state").textContent = hasKey ? "ใส่คีย์แล้ว" : "ยังไม่ตั้งค่า";
  $("api-state").className = `chip ${hasKey ? "done" : "queued"}`;
  updateKeyBanner();
}

$("toggle-key").addEventListener("click", () => {
  const inp = $("api-key"), show = inp.type === "password";
  inp.type = show ? "text" : "password";
  $("toggle-key").textContent = show ? "ซ่อน" : "แสดง";
});

$("provider-select").addEventListener("change", async () => {
  const p = PROVIDERS[$("provider-select").value];
  $("base-url").value = p.baseUrl;
  $("model-select").value = p.model;
  $("api-key").value = (await chrome.storage.local.get(p.keyStore))[p.keyStore] || "";
});

function originPattern(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.hostname}/*` : null;
  } catch {
    return null;
  }
}

function aiMsg(text, kind = "") {
  $("ai-msg").textContent = text;
  $("ai-msg").className = `form-msg ${kind}`;
}

// Must run straight from the click: permissions.request needs the user gesture.
async function saveAi() {
  const baseUrl = $("base-url").value.trim() || DEFAULT_BASE;
  const pattern = originPattern(baseUrl);
  if (!pattern) throw new Error("Base URL ไม่ถูกต้อง");
  let permOk = true;
  if (!pattern.startsWith("https://api.deepseek.com/")) permOk = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
  const provider = PROVIDERS[$("provider-select").value] ? $("provider-select").value : "deepseek";
  const key = $("api-key").value.trim();
  await chrome.storage.local.set({
    provider, baseUrl, apiKey: key, [PROVIDERS[provider].keyStore]: key,
    model: $("model-select").value.trim() || DEFAULT_MODEL,
  });
  await loadAi();
  return permOk;
}

$("btn-save-ai").addEventListener("click", async () => {
  try {
    const permOk = await saveAi();
    aiMsg(permOk ? "✅ บันทึกแล้ว" : "บันทึกแล้ว แต่ยังไม่ได้อนุญาตให้เชื่อมต่อ Base URL นี้ — กดบันทึกอีกครั้งแล้วกด “อนุญาต”", permOk ? "ok" : "err");
  } catch (e) {
    aiMsg(e.message, "err");
  }
});

$("btn-test-ai").addEventListener("click", async () => {
  try {
    await saveAi();
    const { apiKey, model, baseUrl } = await chrome.storage.local.get(["apiKey", "model", "baseUrl"]);
    if (!apiKey) return aiMsg("ใส่ API Key ก่อน", "err");
    aiMsg("กำลังทดสอบ...");
    const t = Date.now();
    const res = await fetch(endpointFrom(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: 'ตอบเป็น JSON object: {"ok": true}' }], response_format: { type: "json_object" }, max_tokens: 2000 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return aiMsg(`❌ เชื่อมต่อไม่ได้: ${(data.error && data.error.message) || `HTTP ${res.status}`}`, "err");
    let balance = "";
    if (originPattern(baseUrl) === "https://api.deepseek.com/*") {
      const b = await fetch(DEFAULT_BASE + "/user/balance", { headers: { Authorization: `Bearer ${apiKey}` } }).then((r) => r.json()).catch(() => null);
      const info = b && (b.balance_infos || []).filter((x) => Number(x.total_balance) > 0).map((x) => `${x.total_balance} ${x.currency}`).join(", ");
      if (b) balance = ` · ยอดเงินคงเหลือ ${info || "0"}`;
    }
    aiMsg(`✅ ใช้งานได้ — โมเดล ${data.model || model} ตอบใน ${((Date.now() - t) / 1000).toFixed(1)} วิ${balance}`, "ok");
  } catch (e) {
    aiMsg(`❌ เชื่อมต่อไม่ได้: ${e.message}`, "err");
  }
});

// ---------- settings: files ----------

function fillSettings() {
  $("set-folder").value = state.settings.folder;
  $("set-attempts").value = String(state.settings.maxAttempts);
  $("set-save-image").checked = state.settings.saveImage;
  $("set-clean-chats").checked = state.settings.deleteChats === true;
}

$("btn-save-settings").addEventListener("click", async () => {
  try {
    await send({ type: "saveSettings", settings: { folder: $("set-folder").value, maxAttempts: $("set-attempts").value, saveImage: $("set-save-image").checked, deleteChats: $("set-clean-chats").checked } });
    await load();
    fillSettings();
    $("settings-saved").textContent = "บันทึกแล้ว";
    setTimeout(() => ($("settings-saved").textContent = ""), 2000);
  } catch (e) {
    toast(e.message);
  }
});

$("btn-reset-scenes").addEventListener("click", () => send({ type: "resetScenes" }).then(() => toast("ล้างประวัติฉากแล้ว"), (e) => toast(e.message)));

// ---------- unlock code with an expiry date (checked locally, lib/license.js) ----------

const thDate = (ms) => new Date(ms).toLocaleDateString("th-TH", { dateStyle: "long" });
const daysLeft = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
const lockMsg = (text, kind = "") => { $("license-msg").textContent = text; $("license-msg").className = `form-msg ${kind}`; };

// Lock the panel until this browser has a valid, unexpired code. open = show the code screen anyway (new code).
async function checkLicense(open = false) {
  const st = await license.status().catch(() => ({ ok: false, reason: "none" }));
  const show = open || !st.ok;
  const wasHidden = $("lock").classList.contains("hidden");
  $("lock").classList.toggle("hidden", !show);
  $("lock-close").classList.toggle("hidden", !st.ok);
  if (show && wasHidden) {
    lockMsg({ expired: `รหัสหมดอายุแล้ว (เมื่อ ${thDate(st.expires)}) — ขอรหัสใหม่`, clock: "วันเวลาในเครื่องไม่ถูกต้อง — ตั้งให้ตรงก่อน" }[st.reason] || "", "err");
    setTimeout(() => $("license-input").focus(), 50);
  }
  $("lic-exp").textContent = st.ok ? `ใช้ได้ถึง ${thDate(st.expires)} (เหลืออีก ${daysLeft(st.expires)} วัน)` : "—";
  const soon = st.ok && daysLeft(st.expires) <= 3;
  $("lic-banner").classList.toggle("hidden", !soon);
  if (soon) $("lic-banner").textContent = `🔐 รหัสเปิดใช้งานจะหมดอายุในอีก ${daysLeft(st.expires)} วัน (${thDate(st.expires)})`;
  return st.ok;
}

async function activateLicense() {
  const r = await license.activate($("license-input").value).catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) return lockMsg(r.error, "err");
  lockMsg("");
  $("license-input").value = "";
  await checkLicense();
  toast("เปิดใช้งานแล้ว ✅");
  chrome.runtime.sendMessage({ type: "tick" }).catch(() => {});
}
$("btn-activate").addEventListener("click", activateLicense);
$("btn-new-code").addEventListener("click", () => checkLicense(true));
$("lock-close").addEventListener("click", () => { lockMsg(""); $("lock").classList.add("hidden"); });
setInterval(() => { if (document.visibilityState === "visible" && $("lock").classList.contains("hidden")) checkLicense(); }, 60000); // expires while open
$("license-input").addEventListener("keydown", (e) => { if (e.key === "Enter") activateLicense(); });

// ---------- boot ----------

$("app-ver").textContent = chrome.runtime.getManifest().version;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = Object.keys(changes);
  if (keys.includes("unlockCode")) checkLicense();
  if (keys.some((k) => ["apiKey", "model", "baseUrl", "provider"].includes(k))) loadAi();
  if (keys.some((k) => !k.startsWith("img:") && !k.startsWith("key"))) load();
});
setInterval(renderStatus, 1000);
// While the panel is open, nudge the engine every 5 s so progress shows up faster than its 30 s alarm.
setInterval(() => { if (document.visibilityState === "visible") chrome.runtime.sendMessage({ type: "tick" }).catch(() => {}); }, 5000);

checkLicense();
syncPersona();
syncProduct();
loadAi();
load().then(() => {
  fillSettings();
  if (state.batches.some((b) => count(b, "queued") + count(b, "running"))) showTab("queue");
  chrome.runtime.sendMessage({ type: "tick" }).catch(() => {});
});
