'use strict';
/* ============================================================
 *  generate.js — พรอมต์โหมด "ตัวตน" และ "สินค้า" (อิงจาก Prompt Creator Studio)
 *  ฉบับ Vid Studio: ไม่มีซีรีย์ / License / คลังพรอมต์จากเว็บ · บทพูด 10 วิ (คลิป Meta AI ยาว 10 วิ)
 *
 *  เขียนพรอมต์ "ทีละชุด" ตอนใกล้ถึงคิว (ตัวรันงานเรียก writeSet ล่วงหน้า 1 ชุด ระหว่าง Meta AI กำลังสร้างชุดก่อน)
 *  - planBatch: สุ่มใบสั่งฉากทั้งก้อนครั้งเดียว (ไม่เรียก AI) → ชุดที่เขียนแยกกันก็ไม่ซ้ำฉากกัน
 *  - writeSet: เรียก DeepSeek 1 ครั้ง ได้พรอมต์ภาพ + บทพูดของ 1 ชุด
 * ============================================================ */
import * as ENG from './product-engine.js';
import * as PE from './persona-engine.js';
import * as LIB from './library-engine.js';
import * as KB from './product-knowledge.js';
import * as store from './store.js';
import { thaiLook, ageFrom } from './thai-look.js';
import { randomHand } from '../scenes.js';
import { DEFAULT_MODEL, callDeepSeek } from './llm.js';

export const SECONDS = 10;
export const MAX_SETS = 50;
export const MAX_LIBRARY = 300;

// 📚 คลังพรอมต์ (สุ่มผสมในเครื่อง ไม่ใช้ AI)
export function librarySets(fields, count) {
  const cnt = Math.max(1, Math.min(MAX_LIBRARY, parseInt(count, 10) || 1));
  return LIB.assembleMany(fields.gender || 'female', cnt, { faceLock: fields.faceLock, outfitLock: fields.outfitLock })
    .map(p => ({ image_prompt: p, video_prompt: '' }));
}

/**
 * วางแผนทั้งก้อน (ไม่เรียก AI) → { recipes: [ใบสั่งฉากต่อชุด], category: key | null, look: ลุคพรีเซ็นเตอร์จากคลัง }
 */
export function planBatch(mode, fields, count) {
  if (mode === 'persona') {
    // หน้าตา + แต่งหน้า + ผม = "อินฟลูไทย" (thai-look.js) — DeepSeek เขียนแค่ชุด/ท่า/ฉาก
    // (หน้าจากคลังพรอมต์ Douyin ใน Meta AI ออกมาเป็นหน้าตุ๊กตา ดูเป็น AI — ผู้ใช้ไม่ชอบ)
    // คนเดิมทุกชุด = หน้าเดียวกันทุกชุด · ล็อกหน้าจากรูป = ไม่ใส่ (หน้ามาจากรูป)
    const recipes = PE.planScenes(fields, count);
    if (fields.faceLock !== 'photo' && fields.outfitLock !== 'face_photo') {
      const look = () => thaiLook(fields.gender, { details: `${fields.name || ''} ${fields.details || ''}`, skin: fields.skinTone });
      const same = fields.faceLock === 'first' ? look() : '';
      for (const r of recipes) r.who = same || look();
    }
    return { recipes, category: null, look: '' };
  }
  const cat = KB.detectCategory(`${fields.name || ''} ${fields.details || ''}`.trim()).category;
  const scenes = ENG.planScenes(fields, count, cat);
  // หน้าพรีเซ็นเตอร์ "คนไทยตามวัย" (thai-look.js) ทุกสไตล์ที่เห็นหน้า — อายุจากช่อง "อายุพรีเซ็นเตอร์" หรือรายละเอียดสินค้า
  // คนละคน = สุ่มใหม่ทุกชุด (เพศ "AI เลือก" = สุ่มเพศรายชุด) · คนเดิมทุกชุด = หน้าเดียวกัน · ล็อกจากรูปหน้า = ไม่ใส่
  // ช็อตเห็นแค่มือ / โกดัง: มือคนละแบบทุกชุด (ผิว เล็บ แขนเสื้อ เครื่องประดับ) — คนใช้เยอะ ห้ามซ้ำ
  if (['hands', 'warehouse'].includes(fields.style)) {
    return { recipes: scenes.map((scene) => ({ scene, hand: randomHand(fields.gender || 'any') })), category: cat.key, look: '' };
  }
  const shows = !['hands', 'warehouse', 'tabletop'].includes(fields.style || '');
  if (!shows || fields.faceLock === 'photo' || fields.outfitLock === 'face_photo') return { recipes: scenes, category: cat.key, look: '' };
  const ageText = fields.presenterAge ? `อายุ ${fields.presenterAge}` : '';
  const one = () => {
    const gender = fields.gender || (Math.random() < 0.5 ? 'female' : 'male');
    return { gender, who: thaiLook(gender, { details: `${ageText} ${fields.name || ''} ${fields.details || ''}` }) };
  };
  const same = fields.faceLock === 'first' || fields.faceLock === 'library' ? one() : null;
  return { recipes: scenes.map((scene) => ({ scene, ...(same || one()) })), category: cat.key, look: '' };
}

const categoryOf = (key) => KB.CATEGORIES.find(c => c.key === key) || KB.GENERIC;

/**
 * เขียน 1 ชุดด้วย DeepSeek → { image_prompt, video_prompt, video_prompt_2, headline, overlay, ... }
 *  plan = { recipe, category, look } จาก planBatch · used = { overlays, lines, headlines } ของชุดก่อนๆ (กันซ้ำ)
 */
export async function writeSet(mode, fields, plan = {}, used = {}) {
  const apiKey = String(await store.getValue('apiKey', '')).trim();
  if (!apiKey) throw new Error('ยังไม่ได้ใส่ DeepSeek API Key (ไปที่แท็บ "ตั้งค่า")');
  const model = await store.getValue('model', DEFAULT_MODEL);
  const recipes = plan.recipe ? [plan.recipe] : null;
  let sets;
  if (mode === 'persona') {
    const who = (plan.recipe && plan.recipe.who) || '';
    const user = PE.buildUserPrompt(fields, 1, SECONDS, used.overlays || [], { recipes, usedLines: used.lines || [], whoFromLibrary: !!who });
    sets = await callDeepSeek({ apiKey, model, system: PE.buildSystemPrompt(SECONDS), user, parse: PE.parseSets });
    sets = PE.applyPostProcess(sets, {
      seconds: SECONDS, gender: fields.gender || 'female', overlayText: fields.overlayText || '', aiOverlay: !!fields.aiOverlay,
      faceLock: fields.faceLock, outfitLock: fields.outfitLock, forVideo: !!fields.forVideo, who,
      age: ageFrom(`${fields.name || ''} ${fields.details || ''}`), // 40+ = ลุคตามวัย ไม่ใช่เน็ตไอดอล
    });
  } else {
    // recipe = ใบสั่งฉาก (ข้อความ) หรือ { scene, who, gender } เมื่อมีหน้าพรีเซ็นเตอร์ตามวัย
    const r = plan.recipe;
    const scene = r && typeof r === 'object' ? r.scene : r;
    const who = (r && r.who) || plan.look || '';
    const hand = (r && r.hand) || '';
    const f = r && r.gender ? { ...fields, gender: r.gender } : fields; // เพศรายชุด → คำลงท้าย/เสียงพากย์ตรงกับหน้า
    const user = ENG.buildUserPrompt(f, 1, SECONDS, categoryOf(plan.category), { recipes: scene ? [scene] : null, usedHeadlines: used.headlines || [], whoGiven: !!who, handGiven: !!hand });
    sets = await callDeepSeek({ apiKey, model, system: ENG.buildSystemPrompt(SECONDS), user, parse: ENG.parseSets });
    sets = ENG.applyPostProcess(sets, fields.name || '', {
      seconds: SECONDS, style: fields.style || '', hasProductRef: !!fields.hasProductRef, withHeadline: fields.withHeadline !== false,
      personLook: who, hand, gender: f.gender || '', faceLock: fields.faceLock, outfitLock: fields.outfitLock,
      forVideo: !!fields.forVideo, noPriceNumbers: !ENG.userGavePrice(`${fields.name || ''} ${fields.details || ''}`),
      age: ageFrom(`${fields.presenterAge ? `อายุ ${fields.presenterAge}` : ''} ${fields.name || ''} ${fields.details || ''}`),
    });
  }
  if (!sets.length) throw new Error('AI ไม่ได้ส่งพรอมต์กลับมา');
  return sets[0];
}

export function friendlyError(e) {
  const m = String((e && e.message) || e || 'ไม่ทราบสาเหตุ');
  if (/401|auth|invalid.*key|api key/i.test(m)) return `API Key ไม่ถูกต้อง (${m})`;
  if (/402|insufficient|balance/i.test(m)) return `ยอดเงินใน DeepSeek ไม่พอ (${m})`;
  if (/429|rate/i.test(m)) return `เรียก AI ถี่เกินไป (${m})`;
  if (/Failed to fetch|NetworkError|network/i.test(m)) return `เชื่อมต่อ AI ไม่ได้ — ตรวจอินเทอร์เน็ตหรือ Base URL (${m})`;
  return m;
}

// ปัญหาที่ลองใหม่ก็ไม่หาย — ให้หยุดรอผู้ใช้แก้ แทนการเผาคิวทิ้ง
export const isFatalAiError = (e) => /401|402|auth|invalid.*key|api key|insufficient|balance|ยังไม่ได้ใส่/i.test(String((e && e.message) || e));

export function detectCategory(text) {
  const r = KB.detectCategory(text);
  return { key: r.category.key, label: r.category.label, score: r.score, generic: r.category.key === 'generic' };
}
