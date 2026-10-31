'use strict';
/* ============================================================
 *  phone-look.js — ให้ภาพเหมือน "โพสต์มือถือจริงของอินฟลูไทย" ไม่ใช่ภาพ AI จ๋า
 *  - PHONE_LOOK*: บล็อกลุคภาพ ใส่ท้ายพรอมต์ภาพทุกโหมด (ข้อความคงที่ ไม่เสียโทเคน DeepSeek)
 *  - deAI(): แปลง/ตัดคำที่ทำให้ภาพดูเป็น AI (cinematic, dramatic, flawless, radiant glowing, 8k ...)
 *    ใช้กับส่วน "ฉาก" ที่ DeepSeek เขียนและที่มาจากคลังฉาก — ห้ามใช้กับชื่อสินค้า/ข้อความของผู้ใช้
 *  ทดสอบกับ Meta AI จริง 2026-10-03: "ฟิลเตอร์บิวตี้ Douyin" ได้หน้าตุ๊กตา ดูเป็น AI → ผู้ใช้ไม่เอา
 *  ข้อความด้านล่าง (แสงหน้าต่าง + แต่งรูปเบาๆ แบบ IG ไทย + ผิวจริง) ได้ภาพเหมือนเซลฟี่อินฟลูไทยจริง
 * ============================================================ */

// ทดสอบกับ Meta AI จริง 2026-10-04 (ผู้ใช้ส่งภาพตัวอย่าง: สาวเน็ตไอดอลไทย แสงกลางวันเรียบๆ ฉากหลังชัด ผิวแอปบิวตี้):
// คำเดิม "light beauty edit like a Thai Instagram post" + ฉากคลังเดิม (golden hour, bokeh, คาเฟ่เกาหลี) = หน้าไอดอลเกาหลี
// แสงทอง หลังเบลอ ดูเป็น AI · คำด้านล่าง (เพื่อนถ่ายด้วยมือถือ + หลังชัด + ลุคแอปบิวตี้) ได้ภาพใกล้ตัวอย่างที่สุด
const PHONE_SHOT = (owner) =>
  `Photo taken by a friend on a vivo phone (rear camera, not a selfie), like ${owner} own Facebook post: soft even daylight, bright exposure, true colours, background sharp and in focus (no bokeh, no golden glow, no colour grading).`;

/** ลุคภาพคน — อายุ 40+ ไม่ใส่ลุคเน็ตไอดอล (ให้หน้าตามวัยจริง) · เพศไม่รู้ (สินค้า "AI เลือก" + หน้าจากรูป) = คำกลางๆ */
export function phoneLook(gender = 'female', age = null) {
  const male = gender === 'male';
  if (gender !== 'male' && gender !== 'female') {
    return `${PHONE_SHOT("a Thai creator's")} Beauty-cam app look — smooth bright skin — a real Thai person, not a K-pop idol, not a model shoot, not AI.`;
  }
  if (age >= 40) {
    const who = male ? 'man' : 'woman';
    return `${PHONE_SHOT(`a Thai ${who}'s`)} Light beauty-cam smoothing only — a real Thai ${who} of ${age} with natural lines, not a model, not AI.`;
  }
  if (male) {
    return `${PHONE_SHOT("a Thai guy's")} Beauty-cam app look — clear bright skin, neat brows — a handsome real Thai man, not a K-pop idol, not a model shoot, not AI.`;
  }
  return `${PHONE_SHOT("a pretty Thai net idol's")} Beauty-cam app look on the face — smooth bright skin, lash extensions, pink blush, glossy pink lips — a pretty real Thai woman, not a Korean idol, not a model shoot, not AI.`;
}

export const PHONE_LOOK = phoneLook('female');

// สินค้า / ช็อตมือ: ภาพมือถือจริง แต่งสีเบาๆ
export const PHONE_LOOK_PRODUCT = 'Real vivo phone photo, lightly edited like a Thai Instagram post: natural light, true colours, crisp product. Not CGI or 3D.';

// [รูปแบบ, คำแทน] — ลำดับสำคัญ (วลียาวก่อน)
const SWAPS = [
  [/\b(?:radiant|glowing|luminous)(?:\s*,\s*|\s+)(?:radiant|glowing|luminous)\b/gi, 'fresh'],
  [/\b(?:radiant|glowing|glowy|luminous)\b/gi, 'fresh'],
  [/\b(?:radiantly|glowingly|luminously|flawlessly)\b/gi, 'softly'],
  [/\bflawless\b/gi, 'smooth'],
  [/\bporcelain\b/gi, 'fair'],
  [/\baura\b/gi, 'vibe'],
  [/\b(?:ultra|hyper|photo)[- ]?realistic\b/gi, ''],
  [/\b(?:8k|4k|uhd|hdr|masterpiece|award[- ]winning|best quality|highly detailed|magazine[- ]cover)\b/gi, ''],
  [/\b(?:cinematic|stunning(?:ly)?|perfect(?:ly)?|symmetrical|dramatic|chiaroscuro|moody)\b/gi, ''],
  // แสงทอง/หลังเบลอ/โทนฟิล์ม = ลุค AI (ภาพมือถือจริงฉากหลังชัด แสงกลางวัน)
  [/\b(?:warm\s+)?(?:late[- ]afternoon\s+)?golden[- ]hour(?:\s+(?:light|lighting|glow|warmth|sunlight))?\b/gi, 'daylight'],
  [/\b(?:with\s+)?(?:soft\s+|creamy\s+|dreamy\s+)?bokeh(?:\s+background)?\b/gi, ''],
  [/\b(?:shallow\s+depth\s+of\s+field|blurred\s+background|background\s+blur|dreamy\s+glow|warm\s+glow|rim\s+light(?:ing)?)\b/gi, ''],
  [/\b(?:teal\s+and\s+orange|film[- ]grain|filmic|analog\s+film\s+look)\b/gi, ''],
  [/\bKorean[- ]style\s+/gi, ''],
];

export function deAI(text) {
  let s = String(text || '');
  for (const [re, to] of SWAPS) s = s.replace(re, to);
  return s
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+([,.;:)])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,;:.]+/, '')
    .trim();
}
