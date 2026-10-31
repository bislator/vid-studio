'use strict';
/* ============================================================
 *  library-engine.js — สุ่มผสมพรอมต์ภาพ "เน็ตไอดอลสาวสวย" (ภาษาอังกฤษ)
 *  - หญิง/ชาย จากพูลที่เขียนเอง (library-female.js / library-male.js)
 *  - สุ่มสลับ face/hair/skin/outfit/pose/background/lighting/camera
 *    + face variety → หลายล้านแบบ หน้าไม่ซ้ำ (local ไม่ใช้ AI)
 * ============================================================ */
import { FEMALE } from './library-female.js';
import { MALE } from './library-male.js';
import { FACE_VARIETY } from './brain.js';
import { phoneLook, deAI } from './phone-look.js';

const POOLS = { female: FEMALE, male: MALE };

// ความยาวสูงสุดต่อส่วน (ตัวอักษร) — คลังเขียนไว้ยาวมาก (ฉากหลังบางอันเกิน 700) ใช้แค่ใจความแรก
// หน้าตา/ผม/แต่งหน้า คือส่วนที่ทำให้ "สวยแบบคลัง" → ให้ยาวกว่าส่วนอื่น (แต่งหน้าเก็บทั้งท่อนก่อน ; = ตา แก้ม ปาก)
const MAX = { figure: 120, hair: 100, skin: 200, outfit: 80, pose: 80, background: 70, lighting: 60, camera: 60 };

// หัวข้อนำหน้าที่ไม่มีเนื้อหา เช่น "Camera angle & composition." "Location:" "Shot distance:"
const HEADING = /^(?:camera angle(?: & composition)?|composition|shot distance|camera level|location|atmosphere|outfit accessory|top|direction)\s*[:.]\s*/i;
// คลังบางอันอ้าง "ไฟล์แนบ" ของงานต้นฉบับ ซึ่งไม่มีอยู่จริงที่นี่
const ATTACHED = /\s*(?:,\s*)?(?:paired with )?(?:the )?(?:outfit )?(?:per|from) (?:the )?attached (?:file|image)(?: \d+)?/gi;

// ย่อข้อความจากคลัง: ตัดวงเล็บ/หัวข้อ/อ้างไฟล์แนบ → เอาก่อน ; หรือ . แรก → ยาวเกินก็ตัดที่จุลภาค
function brief(text, max) {
  let s = String(text || '').replace(/\s*\([^)]*\)/g, '').replace(ATTACHED, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2 && HEADING.test(s); i++) s = s.replace(HEADING, '');
  s = s.replace(/^([A-Z][A-Za-z ]{2,24}):\s+/, '$1, '); // "Natural light: soft …" → "Natural light, soft …"
  s = s.split(/[;.](?:\s|$)/)[0].trim();
  if (s.length > max) {
    const comma = s.lastIndexOf(',', max);
    s = comma > max * 0.4 ? s.slice(0, comma) : s.slice(0, s.lastIndexOf(' ', max));
  }
  // ตัดกลางวลีแล้วอย่าให้ค้างที่คำเชื่อม ("...framing but")
  for (let i = 0; i < 3; i++) s = s.replace(/[\s,;:.]+$/, '').replace(/\s+(?:but|and|or|with|to|of|for|the|a|an|using|in|on|at|from|through|while|so|as|that|which|by)$/i, '');
  return deAI(s);
}

// ท่า = โพสถ่ายรูปธรรมดา มือวางสบายๆ (ผู้ใช้ 2026-10-04: ไม่เอาชูมือ/โบกมือ/จับผม/ทำท่าทาง) — คัดท่าแบบนั้นออกจากคลัง
const GESTURE = new RegExp([
  String.raw`\bwav(?:e|es|ing)\b`, 'peace sign', String.raw`\bV[- ]sign`, String.raw`\braise[ds]?\b`, String.raw`\braising\b`,
  String.raw`\bpoint(?:s|ing)\b`, 'thumbs[- ]up', 'finger heart', 'mini heart', 'heart (?:sign|shape|gesture)', 'blow(?:s|ing)? a kiss',
  'salut', 'gestur', String.raw`\barms? (?:up|out|open|outstretched|overhead|stretched)`, String.raw`\bstretch`, 'selfie', 'reaching up',
  String.raw`(?:hand|hands|finger|fingers|palm|palms) (?:to|on|near|under|against|cupping|touching|framing) (?:her |his |the )?(?:face|cheeks?|chin|jaw|lips|mouth|hair|head|forehead)`,
  'through (?:her |his )?hair', 'touch(?:es|ing)? (?:her |his )?(?:hair|face|cheeks?|chin|lips)', 'tuck(?:s|ing)? (?:her |his )?hair',
  '(?:gather|hold|grab|pull|flip|sweep|brush|play)(?:s|ing)? (?:her |his )?hair', 'up to (?:her |his )?(?:lips|mouth|face)',
].join('|'), 'i');
const POSES = Object.fromEntries(Object.entries(POOLS).map(([G, P]) => {
  const calm = (P.pose || []).filter((p) => !GESTURE.test(p));
  return [G, calm.length ? calm : P.pose];
}));

const take = (G, key) => brief(pick(key === 'pose' ? POSES[G] : POOLS[G][key]), MAX[key]);

// ลุคภาพ = รูปมือถือจริงแบบโพสต์ของคนไทย (phoneLook) + ท่ามือสบายๆ + กันตัวหนังสือ
const AVOID = 'Simple photo pose with natural, relaxed hands (no waving, no peace sign, no raised hands); no text; fully clothed; vertical 9:16.';

function pick(arr) { return (Array.isArray(arr) && arr.length) ? arr[Math.floor(Math.random() * arr.length)] : ''; }
function g(gender) { return gender === 'male' ? 'male' : 'female'; }

function stripPhotoOf(s) { return String(s || '').replace(/^(a\s+)?photo of\s+/i, '').trim(); }

// หน้าตา/ทรงผม/ผิว ของตัวแบบ
function pickWho(G) {
  return [
    `${stripPhotoOf(take(G, 'figure'))}, ${pick(FACE_VARIETY[G])}.`,
    `Hair: ${take(G, 'hair')}.`,
    `Makeup: ${take(G, 'skin')}.`
  ];
}

// คำบรรยาย "ลุคตัวเอก" แบบกระชับ (figure+หน้า+ผม+ผิว [+ชุด]) ไว้ล็อกข้ามฉาก
export function assembleLook(gender, opts = {}) {
  const G = g(gender);
  const parts = [`${stripPhotoOf(take(G, 'figure'))}, ${pick(FACE_VARIETY[G])}`, `hair: ${take(G, 'hair')}`, `makeup: ${take(G, 'skin')}`];
  if (opts.full) parts.push(`outfit: ${take(G, 'outfit')}`);
  return parts.join('; ');
}

// ประกอบ 1 พรอมต์ (สุ่ม) — ภาษาอังกฤษ บรรทัดเดียว สั้นๆ
// opts.who / opts.outfit: undefined = สุ่มใหม่ · null = ไม่ใส่ (ล็อกจากรูปที่แนบ) · ค่า = ใช้ค่านี้ (คนเดิม/ชุดเดิมทุกภาพ)
export function assemble(gender, opts = {}) {
  const G = g(gender);
  const parts = [];
  const who = opts.who === undefined ? pickWho(G) : opts.who;
  if (who) parts.push(...who);
  const outfit = opts.outfit === undefined ? take(G, 'outfit') : opts.outfit;
  if (outfit) parts.push(`Outfit: ${outfit}.`);
  parts.push(`Pose: ${take(G, 'pose')}.`, `Background: ${take(G, 'background')}.`, `Light: ${take(G, 'lighting')}.`, `Camera: ${take(G, 'camera')}.`);
  return [...parts, phoneLook(G), AVOID].join(' ');
}

// ประกอบ n พรอมต์ ไม่ให้ซ้ำ
// opts.faceLock: none | first (หน้าเดียวกันทุกภาพ) | photo (หน้าจากรูปแนบ — ไม่บรรยายหน้า)
// opts.outfitLock: free | first (ชุดเดียวกันทุกภาพ) | photo / face_photo (ชุดจากรูปแนบ — ไม่บรรยายชุด)
export function assembleMany(gender, n, { faceLock = 'none', outfitLock = 'free' } = {}) {
  const G = g(gender);
  const opts = {
    who: faceLock === 'photo' || outfitLock === 'face_photo' ? null : faceLock === 'first' ? pickWho(G) : undefined,
    outfit: outfitLock === 'photo' || outfitLock === 'face_photo' ? null : outfitLock === 'first' ? take(G, 'outfit') : undefined
  };
  const out = [], seen = new Set();
  const target = Math.max(1, n);
  let tries = 0;
  while (out.length < target && tries < target * 40) {
    tries++;
    const prompt = assemble(gender, opts);
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    out.push(prompt);
  }
  return out;
}

// จำนวนคอมบิเนชันโดยประมาณ (ไว้โชว์ให้ผู้ใช้)
export function comboCount(gender) {
  const G = g(gender);
  const p = POOLS[G];
  const keys = ['figure', 'hair', 'skin', 'outfit', 'pose', 'background', 'lighting', 'camera'];
  let c = (FACE_VARIETY[G] || []).length || 1;
  for (const k of keys) c *= Math.max(1, (p[k] || []).length);
  return c;
}
