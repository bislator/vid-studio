'use strict';
/* ============================================================
 *  json-salvage.js — อ่าน JSON จากผลลัพธ์ LLM แบบ "ทนทาน"
 *  ------------------------------------------------------------
 *  แทนที่ pattern เดิม `text.match(/\{[\s\S]*\}/)` ที่เปราะมาก
 *  (ต้องมี } ปิดท้าย ถ้า output ถูกตัดกลางคัน = พังทั้งก้อน → 0 ชุด)
 *
 *  รับมือได้:
 *   1) โค้ดเฟนซ์ ```json ... ``` และข้อความห่อหน้า/หลัง
 *   2) newline/tab ดิบภายในสตริง (บทพูดไทยหลายบรรทัด) → escape ให้
 *   3) คอมมาเกินก่อน } ]  (trailing comma)
 *   4) ⭐ ผลลัพธ์ "ถูกตัดกลางคัน" เพราะชน max_tokens → กู้เฉพาะ
 *      "ชุดที่ปิดวงเล็บครบ" ออกมาให้ (เช่น สั่ง 6 ได้ครบ 5 ยังดีกว่า 0)
 *
 *  ใช้ร่วมทุกเอนจิน: persona / product / series / bible(roles)
 * ============================================================ */

// ---- ลอกโค้ดเฟนซ์ + BOM ----
function stripFence(s) {
  let t = String(s || '').replace(/^﻿/, '').trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

// ---- ซ่อม JSON: escape อักขระควบคุมดิบ "ภายในสตริง" + ตัดคอมมาเกิน ----
// เดินทีละตัวอักษรเพื่อรู้ว่าอยู่ในสตริงหรือไม่ (JSON.parse พังทันทีเมื่อเจอ \n ดิบในสตริง)
function repairJson(s) {
  let out = '';
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

function tryParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// ---- เดินหา "ทุกบล็อก {...} ที่ปิดวงเล็บครบ" (string-aware) ----
// คืนตามลำดับที่ปิด (บล็อกในสุดปิดก่อน) — ตัวที่ยังไม่ปิด (ถูกตัดท้าย) จะไม่ถูกเก็บ
function extractObjects(s) {
  const objs = [];
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') stack.push(i);
    else if (ch === '}' && stack.length) { const start = stack.pop(); objs.push(s.slice(start, i + 1)); }
  }
  return objs;
}

const DEFAULT_ARRAY_KEYS = ['sets', 'series', 'scenes', 'data', 'results', 'items'];
const DEFAULT_ITEM_KEYS = [
  'image_prompt', 'image', 'imagePrompt',
  'video_prompt', 'video', 'script', 'video_prompt_2',
  'overlay_text', 'overlay', 'caption', 'headline'
];

function findArray(root, arrayKeys) {
  if (Array.isArray(root)) return root;
  if (root && typeof root === 'object') {
    for (const k of arrayKeys) if (Array.isArray(root[k])) return root[k];
  }
  return null;
}

/**
 * salvageSets(content, opts) → Array ของออบเจกต์ "ชุด" (ทน truncation/malformed)
 *  opts.arrayKeys : ชื่อฟิลด์ที่อาจเป็นอาเรย์ของชุด
 *  opts.itemKeys  : คีย์ที่บ่งบอกว่าออบเจกต์เป็น "หนึ่งชุด"
 *  - คืน [] ถ้ากู้อะไรไม่ได้เลย → ให้ผู้เรียกตัดสินใจ throw เอง
 */
function salvageSets(content, opts = {}) {
  const arrayKeys = opts.arrayKeys || DEFAULT_ARRAY_KEYS;
  const itemKeys = opts.itemKeys || DEFAULT_ITEM_KEYS;
  const cleaned = stripFence(content);

  // 1) fast path — parse ตรง แล้วลอง repair (แก้ newline ดิบ/คอมมาเกินทั้งก้อน)
  const root = tryParse(cleaned) || tryParse(repairJson(cleaned));
  if (root) {
    const arr = findArray(root, arrayKeys);
    if (arr) return arr;
    if (typeof root === 'object' && itemKeys.some(k => k in root)) return [root];
  }

  // 2) ถูกตัดกลางคัน / พังบางส่วน → กู้ทีละบล็อก {...} ที่ปิดครบ
  const blocks = extractObjects(cleaned);
  const out = [];
  for (const b of blocks) {
    const o = tryParse(b) || tryParse(repairJson(b));
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    // เจอ wrapper ที่ห่ออาเรย์ของชุดไว้ (และมีสมาชิก) → ใช้อันนั้นทันที
    const arr = findArray(o, arrayKeys);
    if (arr && arr.length) return arr;
    // ออบเจกต์หน้าตาเป็น "ชุด" (ชุดในสคีมานี้เป็น flat ค่าเป็นสตริง จึงไม่ซ้อนกันเอง)
    if (itemKeys.some(k => k in o)) out.push(o);
  }
  return out;
}

/**
 * salvageObject(content) → Object เดียว (เช่น bible/character sheet) หรือ null
 *  - fast path + repair (แก้ newline ดิบในสตริง) ก่อนยอมแพ้
 */
function salvageObject(content) {
  const cleaned = stripFence(content);
  const root = tryParse(cleaned) || tryParse(repairJson(cleaned));
  if (root && typeof root === 'object') return root;
  // สำรอง: บล็อก {...} ที่ใหญ่ที่สุดซึ่ง parse ได้ (กรณีมีข้อความห่อ/ต่อท้าย)
  const blocks = extractObjects(cleaned).sort((a, b) => b.length - a.length);
  for (const b of blocks) {
    const o = tryParse(b) || tryParse(repairJson(b));
    if (o && typeof o === 'object') return o;
  }
  return null;
}

export { stripFence, repairJson, extractObjects, salvageSets, salvageObject };
