'use strict';
/* ============================================================
 *  product-knowledge.js — หมวดสินค้า + การตรวจจับหมวด
 *  ข้อมูล (CATEGORIES/GENERIC) ย้ายไป "สมอง" บนเซิร์ฟเวอร์
 *  ไฟล์นี้เก็บแค่ logic (detectCategory/pickContexts) + re-export container จาก brain.js
 * ============================================================ */
import { CATEGORIES, GENERIC } from './brain.js';

/** ตรวจหมวดสินค้าจากข้อความ → { category, score } (score 0 = ใช้ generic) */
function detectCategory(text) {
  const q = String(text || '').toLowerCase();
  if (!q.trim()) return { category: GENERIC, score: 0 };
  let best = null, bestScore = 0;
  const words = new Set(q.split(/\s+/));
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of (cat.keywords || [])) {
      // ภาษาไทยไม่เว้นวรรคระหว่างคำ คำค้นสั้น 1-2 ตัว เช่น "นา" จะไปเจอใน "หนา" จึงต้องตรงทั้งคำ
      const k = kw.toLowerCase();
      if (k.length <= 2 ? words.has(k) : q.includes(k)) score += kw.length >= 6 ? 2 : 1;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  if (best && bestScore > 0) return { category: best, score: bestScore };
  return { category: GENERIC, score: 0 };
}

/** สุ่มหยิบบริบทจากหมวด n ชุด → [{ scene, persona, action, lighting }] */
function pickContexts(category, n) {
  const cat = category || GENERIC;
  const shuffle = (arr) => {
    const a = [...(arr || [])];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const take = (arr, i) => (arr && arr.length) ? arr[i % arr.length] : '';
  const scenes = shuffle(cat.scenes);
  const personas = shuffle(cat.personas);
  const actions = shuffle(cat.actions);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      scene: take(scenes, i),
      persona: take(personas, i),
      action: take(actions, i),
      lighting: cat.lighting || GENERIC.lighting
    });
  }
  return out;
}

export { CATEGORIES, GENERIC, detectCategory, pickContexts };
