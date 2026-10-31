'use strict';
/* ============================================================
 *  thai-look.js — หน้าตา "คนไทยแบบอินฟลู/ครีเอเตอร์" ภาพถ่ายจริง (ไม่ใช่หน้าตุ๊กตา Douyin)
 *  ทดสอบกับ Meta AI จริง 2026-10-03: "Thai TikTok influencer + glam-but-natural Thai makeup"
 *  ได้หน้าไทยสวยเหมือนเซลฟี่จริง · คลังพรอมต์ Douyin (ตากลมโต ปากฉ่ำ glass skin) ได้หน้าตุ๊กตา ดูเป็น AI
 *
 *  - หน้าตาตาม "วัย" ที่อ่านจากชื่อ/รายละเอียด: "อายุ 55" "อายุห้าสิบห้า" "55 ปี" "วัยกลางคน" "คุณลุง" ...
 *    อายุมาก = มีริ้วรอย ผมหงอก หน้าตาตามวัยจริง (ไม่ใช่หนุ่มสาวหน้าใส)
 *  - นักเรียนหลายคนใช้พร้อมกัน → สุ่มผสมหลายส่วน (หน้า ตา แต่งหน้า ผม สีหน้า จุดเด่น เครื่องประดับ บทบาท)
 *    ได้หลายล้านแบบต่อเพศ/วัย คนละคนทุกชุด (หรือหน้าเดียวกันทุกชุดเมื่อ "คนเดิม")
 * ============================================================ */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- อายุ ---------- */
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const WORD = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
const WORDS_RE = /^(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)+/;

// "ห้าสิบห้า" → 55 · "ยี่สิบเอ็ด" → 21 · "สิบแปด" → 18 · "เจ็ด" → 7
function thaiWordsToNumber(s) {
  const tokens = s.match(/ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ/g) || [];
  const i = tokens.indexOf('สิบ');
  if (i < 0) return tokens.length ? WORD[tokens[0]] : null;
  const tens = i === 0 ? 1 : WORD[tokens[i - 1]];
  const units = tokens[i + 1] ? WORD[tokens[i + 1]] : 0;
  return tens * 10 + units;
}

// คำบอกวัย (ภาษาไทยไม่มีช่องว่างระหว่างคำ → ใช้แต่คำที่ไม่ไปชนคำอื่น เช่น "ป้า" อยู่ใน "เป้าหมาย", "ตา" อยู่ใน "หน้าตา")
const AGE_WORDS = [
  [/วัยรุ่น|\bteen/i, 19], [/นักศึกษา|มหาลัย/, 21], [/วัยทำงาน/, 30], [/วัยกลางคน|middle[- ]aged/i, 45],
  [/คุณป้า|คุณลุง/, 55], [/ผู้สูงอายุ|สูงวัย|วัยเกษียณ|คนแก่|\belderly|\bsenior/i, 65], [/คุณยาย|คุณตา/, 70],
];

/** อายุจากข้อความ (ชื่อ + รายละเอียด) หรือ null */
export function ageFrom(text) {
  const t = String(text || '').replace(/[๐-๙]/g, (d) => THAI_DIGITS.indexOf(d));
  const m = /อายุ\s*(\d{1,2})/.exec(t) || /(\d{2})\s*(?:ปี|ขวบ)/.exec(t) || /(\d{2})\s*(?:years?\s*old|y\/?o)\b/i.exec(t) || /\bage[d]?\s*(\d{2})/i.exec(t);
  if (m) return Number(m[1]);
  const after = /อายุ\s*(.*)/.exec(t);
  if (after) {
    const w = WORDS_RE.exec(after[1].replace(/\s+/g, ''));
    if (w) { const n = thaiWordsToNumber(w[0]); if (n) return n; }
  }
  const years = /((?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)*สิบ(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?)\s*ปี/.exec(t); // "หกสิบปี"
  if (years) return thaiWordsToNumber(years[1]);
  for (const [re, n] of AGE_WORDS) if (re.test(t)) return n;
  return null;
}

const bandOf = (age) => (age == null || age < 30 ? 'young' : age < 40 ? 'thirties' : age < 55 ? 'middle' : 'senior');

/* ---------- พูลหน้าตา ---------- */
const FEMALE = {
  role: {
    young: ['Thai TikTok influencer', 'Thai Instagram creator', 'Thai lifestyle vlogger', 'Thai content creator'],
    thirties: ['Thai lifestyle creator', 'Thai content creator', 'Thai Instagram creator'],
    middle: ['Thai content creator', 'Thai lifestyle creator'],
    senior: ['Thai content creator'],
  },
  face: {
    young: ['soft oval face', 'sweet round face with soft cheeks', 'heart-shaped face with a small chin', 'face with high cheekbones and a softly defined jaw',
      'slim V-line face', 'soft square face with a gentle jaw', 'long oval face with an elegant profile', 'baby-faced look with full cheeks'],
    thirties: ['elegant oval face', 'soft round face', 'heart-shaped face', 'face with defined cheekbones', 'warm square-jawed face', 'slim oval face with mature features'],
    middle: ['graceful oval face with fine smile lines', 'kind round face with soft laugh lines', 'elegant face with gentle crow\'s feet', 'warm face with mature, softened features'],
    senior: ['kind face with real smile lines and soft wrinkles', 'warm round face with visible wrinkles', 'gentle face with crow\'s feet and laugh lines', 'graceful aged face with soft wrinkles around the eyes'],
  },
  face55: ['mature face with soft smile lines and a few wrinkles', 'graceful face with fine lines around the eyes', 'warm round face with gentle laugh lines', 'elegant mature face with a few wrinkles'],
  eyes: ['natural double eyelids', 'soft monolid eyes', 'warm almond-shaped eyes', 'round bright eyes', 'slightly hooded eyes', 'gentle downturned eyes'],
  makeup: {
    young: ['glam-but-natural Thai makeup (defined brows, soft brown smoky liner, light contour, MLBB lips)', 'light everyday makeup (soft brown eyeliner, peach blush, rosy-nude lips)',
      'soft glam makeup (brushed-up brows, warm brown eyeshadow, coral lips)', 'clean fresh makeup (light base, soft pink blush, pink-nude tinted lips)',
      'bold-ish makeup (winged liner, terracotta lips)', 'soft pink everyday makeup with glossy lips'],
    thirties: ['polished natural makeup (soft brown liner, nude-rose lips)', 'soft glam makeup (warm eyeshadow, coral lips)', 'minimal makeup with a berry lip', 'clean office makeup (neat brows, mauve lips)'],
    middle: ['polished light makeup (neat brows, soft rose lips)', 'elegant natural makeup with a mauve lip', 'minimal makeup, groomed brows'],
    senior: ['light elegant makeup with a soft rose lip', 'very little makeup, neat brows', 'simple makeup, a touch of lipstick'],
  },
  hair: {
    young: ['long wavy dark-brown hair', 'long straight black hair with curtain bangs', 'shoulder-length layered brown hair', 'long honey-brown hair in loose curls',
      'high ponytail with face-framing strands', 'chin-length bob with blunt bangs', 'messy low bun', 'half-up half-down chestnut hair', 'short pixie cut', 'long ash-brown hair tucked behind one ear'],
    thirties: ['shoulder-length wavy brown hair', 'sleek long black hair', 'neat low ponytail', 'chin-length bob', 'long hair with soft layers', 'tidy bun'],
    middle: ['neat shoulder-length bob', 'shoulder-length hair with a few grey strands', 'short layered haircut', 'tidy low bun', 'wavy medium-length dark hair'],
    senior: ['shoulder-length dark hair with grey streaks', 'short grey-streaked hair', 'silver-grey bob', 'neat salt-and-pepper bun', 'short permed grey hair', 'chin-length hair with grey roots'],
  },
  extra: ['', '', '', 'a small beauty mark near the lip', 'dimples when smiling', 'rosy cheeks', 'a slightly crooked cute smile', 'a tiny mole under one eye'],
  accessory: ['', '', '', 'small gold hoop earrings', 'thin-framed glasses', 'pearl stud earrings', 'a simple necklace', 'a cute hair clip'],
};

const MALE = {
  role: {
    young: ['Thai TikTok influencer', 'Thai content creator', 'Thai lifestyle vlogger', 'Thai Instagram creator'],
    thirties: ['Thai content creator', 'Thai lifestyle creator'],
    middle: ['Thai content creator', 'Thai lifestyle creator'],
    senior: ['Thai content creator'],
  },
  face: {
    young: ['sharp-featured face', 'friendly face with soft features', 'face with a defined jaw', 'boyish round face', 'long face with a straight nose', 'square-jawed face', 'slim face with high cheekbones'],
    thirties: ['mature face with a defined jaw', 'friendly face with soft features', 'square-jawed face', 'slim face with a few smile lines'],
    middle: ['mature face with smile lines', 'broad friendly face with laugh lines', 'face with a few wrinkles and a firm jaw', 'warm face with crow\'s feet'],
    senior: ['kind face with real wrinkles and smile lines', 'weathered face with deep laugh lines', 'round friendly face with visible wrinkles', 'lined face with a warm, grandfatherly look'],
  },
  face55: ['mature face with smile lines and a few wrinkles', 'friendly face with laugh lines around the eyes', 'firm-jawed mature face with a few wrinkles', 'warm face with crow\'s feet'],
  eyes: ['natural double eyelids', 'monolid eyes', 'warm almond-shaped eyes', 'slightly hooded eyes', 'friendly crinkled eyes'],
  groom: {
    young: ['clean-shaven and fresh', 'neat brows and light stubble', 'well-groomed with clear skin', 'a thin moustache'],
    thirties: ['light stubble', 'clean-shaven', 'short neat beard', 'well-groomed'],
    middle: ['clean-shaven', 'short salt-and-pepper stubble', 'neat moustache', 'a little weight in the face'],
    senior: ['clean-shaven with age spots', 'short grey stubble', 'grey moustache', 'a little weight in the face'],
  },
  hair: {
    young: ['short textured black hair', 'two-block cut with a soft fringe', 'short side-parted dark hair', 'medium-length tousled brown hair', 'buzz cut', 'curtain-parted hair', 'short wavy hair'],
    thirties: ['short side-parted hair', 'neat short black hair', 'short textured hair', 'slicked-back hair'],
    middle: ['short hair with salt-and-pepper temples', 'neat side-parted hair going grey', 'short receding hairline', 'cropped dark hair with grey strands'],
    senior: ['short dark hair with grey streaks', 'short grey hair', 'neatly combed salt-and-pepper hair', 'short hair mostly grey', 'receding grey hairline'],
  },
  extra: ['', '', '', 'a small mole on the cheek', 'dimples when smiling', 'thick eyebrows', 'a slightly crooked smile'],
  accessory: ['', '', '', 'thin-framed glasses', 'a simple watch', 'a small stud earring'],
};

// ยิ้มแบบโพสถ่ายรูป (ผู้ใช้ 2026-10-04: แค่แอคถ่ายรูปเฉยๆ — ไม่เอาหัวเราะลั่น/ทำหน้าทะเล้น)
const SMILE = ['bright natural smile', 'soft closed-mouth smile', 'sweet smile at the camera', 'confident gentle smile', 'small shy smile', 'calm friendly expression'];
// 65 ปีขึ้นไป: ผมขาว/ศีรษะล้านได้ด้วย
const ELDER_HAIR = { female: ['short white hair', 'thin white hair in a small bun'], male: ['thinning white hair', 'bald on top with white sides'] };

/* ---------- ประกอบ ---------- */
// ส่วนท้ายสำหรับวัยที่โตแล้ว: กัน Meta AI วาดหน้าเด็ก/นายแบบ
function realAge(age, he) {
  if (age == null || age < 40) return '';
  return ` Looks ${he ? 'his' : 'her'} real age (${age}) — mature, not younger, not a model.`;
}

/** หน้าตา 1 คน — opts: { details, skin } (details = ชื่อ + รายละเอียดจากฟอร์ม) */
export function thaiLook(gender, opts = {}) {
  const male = gender === 'male';
  const age = ageFrom(opts.details);
  const band = bandOf(age);
  const P = male ? MALE : FEMALE;
  const ageWord = age ? `${age}-year-old` : 'young';
  const looks = band === 'senior' || band === 'middle' ? '' : male ? 'handsome ' : 'beautiful ';
  const parts = [
    pick(age >= 55 && age < 65 ? P.face55 : P.face[band]), pick(P.eyes), pick(SMILE),
    opts.skin || (band === 'senior' ? 'natural skin' : 'fair skin'),
    male ? pick(P.groom[band]) : pick(P.makeup[band]),
    pick(age >= 65 ? P.hair[band].concat(ELDER_HAIR[male ? 'male' : 'female']) : P.hair[band]), pick(P.extra), pick(P.accessory),
  ].filter(Boolean);
  return `a ${looks}${ageWord} ${pick(P.role[band])} — ${parts.join(', ')}.${realAge(age, male)}`.replace(/\.\s*$/, '');
}

/** จำนวนแบบโดยประมาณ (ไว้เช็กความหลากหลาย) */
export function lookCount(gender, band = 'young') {
  const P = gender === 'male' ? MALE : FEMALE;
  return P.role[band].length * P.face[band].length * P.eyes.length * SMILE.length * (gender === 'male' ? P.groom[band] : P.makeup[band]).length *
    P.hair[band].length * P.extra.length * P.accessory.length;
}
