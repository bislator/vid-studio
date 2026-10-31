'use strict';
/* ============================================================
 *  script-length.js
 *  ------------------------------------------------------------
 *  คุมความยาว "บทพูด" (video_prompt) ไม่ให้เกินเวลาคลิป
 *
 *  ปัญหาเดิม: system prompt สั่ง 30-40 คำ -> พูดไม่จบใน 8 วิ
 *  แก้: ประเมินจาก "จำนวนตัวอักษรไทยที่ออกเสียง" ซึ่งแม่นกว่าการนับคำ
 *       (ภาษาไทยไม่เว้นวรรคระหว่างคำ การนับคำจึงไม่น่าเชื่อถือ)
 *
 *  อัตราอ้างอิง: คนไทยพูดสไตล์โฆษณา/UGC แบบกระชับ
 *   ~12.5 ตัวอักษรไทยที่ออกเสียง / วินาที (รวมพยัญชนะ+สระ ไม่รวมวรรณยุกต์เดี่ยวๆ)
 *   => 8 วินาที ≈ 100 ตัวอักษร, 16 วินาที ≈ 200 ตัวอักษร
 *  ปรับได้ผ่านตัวแปร CHARS_PER_SECOND
 * ============================================================ */

const CHARS_PER_SECOND = 12.5;

// คำสั่งกันตัวหนังสือมั่ว/ต่างด้าวในวิดีโอ (ใช้ร่วมทุกโหมด)
// - ตัวหนังสือในเฟรมแรก (ปก/แคปชัน) เฟดหายใน 3 วิ แล้วห้ามมีตัวหนังสือใหม่
// - บทพูดเป็น "เสียงพูด" ไม่ใช่ตัวอักษรบนจอ
const NO_SCREEN_TEXT = 'Spoken dialogue only — no subtitles or on-screen text; any cover text fades out within 3s.';

// แบบ "ต่อเนื่อง" (ฉาก 2 ของคลิป 2 ท่อน) — ไม่มีปก/พาดหัวให้เฟด จึงไม่ต้องสั่งเรื่อง 3 วิ แค่ห้ามมีซับพอ
const NO_SUBTITLES = 'Spoken dialogue only — no subtitles or on-screen text.';

// สั่งการแสดงให้ "เป็นธรรมชาติ สมจริง" กันหน้าโอเวอร์ (ตาเหลือก หน้าเว่อร์เกินจริง) — ใช้ร่วมทุกโหมด
const NATURAL_ACTING = 'Natural, restrained acting (not over-acted).';

// ล็อกใบหน้าตอนภาพขยับ (สำคัญกับ Veo/Flow — หน้ามักเพี้ยน/มอร์ฟระหว่างเคลื่อนไหว)
const FACE_HOLD = 'Same person every frame — no face morphing or drift.';

// ความสมจริงระดับ "ภาพถ่ายจริง" (กันลุค AI จ๋า) — ใช้กับ "พรอมต์ภาพ" ทุกโหมด
const PHOTOREAL = 'Looks like a real, high-quality photo — beautiful and polished like a top influencer\'s post, yet still natural and believable (real skin, not plastic), with true-to-life colors and lighting.';
const ANTI_AI = 'Slightly tone down the obvious "AI look": avoid an over-plastic / waxy CGI or 3D-render finish, deformed hands or extra fingers, watermarks and any unwanted on-image text.';

// ตัวอักษรที่ "ไม่นับ" เป็นความยาวเสียง (วรรณยุกต์, การันต์, ช่องว่าง, เครื่องหมาย)
const SILENT = /[\u0E47-\u0E4E\s\.,!?\-\(\)\[\]"'…ฯๆ]/g;

// ลบส่วนที่อยู่ในวงเล็บ (คำสั่งกล้อง/แอคชั่น ไม่ใช่คำพูด) ออกก่อนนับ
function stripDirections(text) {
  return String(text || '')
    .replace(/\([^)]*\)/g, ' ')   // (กล้องแพน...) ฯลฯ
    .replace(/\[[^\]]*\]/g, ' ')  // [Audio: ...] ฯลฯ
    .replace(/\s+/g, ' ')
    .trim();
}

// นับ "ตัวอักษรที่ออกเสียง" ในบทพูด
function spokenCharCount(text) {
  const spoken = stripDirections(text).replace(SILENT, '');
  return spoken.length;
}

// ประเมินวินาทีที่ใช้พูด
function estimateSeconds(text) {
  const chars = spokenCharCount(text);
  return Math.round((chars / CHARS_PER_SECOND) * 10) / 10;
}

// งบจำนวนตัวอักษร "เป้าหมาย" = พูดให้เต็มเวลาพอดี-เกือบล้นนิดๆ (เล็ง ~8-9 วิ สำหรับคลิป 8 วิ)
// เดิมหัก 5% ทำให้บทพูดสั้นไป (~7.6 วิ) → เอาออก + บวก 5% ดันให้พูดเต็ม (AI มักเขียนสั้นกว่าที่สั่ง)
const FILL = 1.05;
function charBudget(seconds) {
  return Math.round(seconds * CHARS_PER_SECOND * FILL);   // 8 วิ ≈ 105 ตัวอักษร (~8.4 วิ)
}

// เพดาน "ตัดบท" — ตัดเฉพาะเมื่อยาวล้นจริง (~1.2 เท่า ≈ 9.6 วิ) ปกติไม่ตัด = "ห้ามลด"
function trimCharCeiling(seconds) {
  return Math.round(seconds * CHARS_PER_SECOND * 1.2);    // 8 วิ ≈ 120 ตัวอักษร
}

// แนะนำจำนวน "คำ" ไว้บอก AI (ภาษาไทย ~1 คำ ≈ 4-4.5 ตัวอักษร)
// ตั้ง min ให้สูง เพื่อให้บทพูดยาวพอเต็มเวลา ไม่สั้นจนมีช่องเงียบยาว
function suggestWordCount(seconds) {
  const chars = charBudget(seconds);
  const words = Math.round(chars / 4.3);
  return { min: Math.max(16, words), max: words + 3, chars };   // 8 วิ ≈ 24-27 คำ
}

/**
 * ตัดบทพูดให้พอดีเวลา โดยพยายามตัด "ตามประโยค" ก่อน
 *  - ถ้าไม่เกินงบ: คืนเดิม
 *  - ถ้าเกิน: เก็บประโยคทีละประโยคจนเกือบเต็มงบ
 *  - ถ้าประโยคแรกยาวเกินงบเอง: ตัดที่จุดเว้นวรรคที่ใกล้งบที่สุด
 *  คืน { text, seconds, trimmed }
 */
function fitToSeconds(text, seconds) {
  const original = String(text || '').trim();
  const budget = trimCharCeiling(seconds);   // ตัดเฉพาะเมื่อล้นเพดาน (~9.6 วิ) — บท 8-9 วิ ไม่ถูกตัด
  if (spokenCharCount(original) <= budget) {
    return { text: original, seconds: estimateSeconds(original), trimmed: false };
  }

  // แตกเป็นประโยคด้วยตัวจบประโยคไทย/สากล
  const parts = original.split(/(?<=[\.!?。…])\s+|(?<=ครับ|ค่ะ|จ้า|นะ|เลย|ด้วย)\s+/u).filter(Boolean);
  let acc = '';
  for (const p of parts) {
    const candidate = acc ? `${acc} ${p}` : p;
    if (spokenCharCount(candidate) > budget) break;
    acc = candidate;
  }

  if (!acc) {
    // ประโยคแรกยาวเกินงบ -> ตัดที่ช่องว่างใกล้งบ
    let cut = original;
    while (spokenCharCount(cut) > budget && cut.includes(' ')) {
      cut = cut.slice(0, cut.lastIndexOf(' ')).trim();
    }
    // ถ้ายังยาวเกิน (ไม่มีช่องว่างให้ตัด) → ตัดตรงตามจำนวนตัวอักษร
    if (spokenCharCount(cut) > budget) cut = cut.slice(0, budget).trim();
    acc = cut || original.slice(0, budget);
  }

  acc = acc.trim();
  // ปิดท้ายให้ดูจบ ถ้ายังไม่มีคำลงท้าย
  // คำลงท้ายตามเพศของบทเดิม (ต้นฉบับเติม "ครับ" เสมอ ทำให้บทผู้หญิงจบด้วย "ครับ")
  if (!/[\.!?…]$|ครับ$|ค่ะ$|จ้า$|นะ$|เลย$/u.test(acc)) acc += /ค่ะ|คะ/.test(original) ? ' ค่ะ' : ' ครับ';

  return { text: acc, seconds: estimateSeconds(acc), trimmed: true };
}

export {
  CHARS_PER_SECOND,
  NO_SCREEN_TEXT,
  NO_SUBTITLES,
  NATURAL_ACTING,
  FACE_HOLD,
  PHOTOREAL,
  ANTI_AI,
  stripDirections,
  spokenCharCount,
  estimateSeconds,
  charBudget,
  suggestWordCount,
  fitToSeconds
};
