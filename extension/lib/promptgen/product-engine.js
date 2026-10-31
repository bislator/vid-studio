'use strict';
/* ============================================================
 *  product-engine.js — ตรรกะสร้างพรอมต์โหมดสินค้า (ทดสอบได้โดยไม่ต้องมี Electron)
 *  main.js แค่เรียกใช้โมดูลนี้ + จัดการ License/IPC/เรียก DeepSeek
 * ============================================================ */
import * as KB from './product-knowledge.js';
import * as LEN from './script-length.js';
import { SCENE_LIB, POOL_LABELS } from './product-scene-knowledge.js';
import { salvageSets } from './json-salvage.js';
import { phoneLook, PHONE_LOOK_PRODUCT, deAI } from './phone-look.js';

// ลุคภาพ = รูปมือถือจริงแบบโพสต์ของคนไทย (phone-look.js) — มีคน: ลุคแอปบิวตี้ตามเพศ/วัย · ไม่มีคน: แต่งสีเบาๆ
const PRODUCT_BOOSTERS = PHONE_LOOK_PRODUCT + ' Vertical 9:16.';
const personBoosters = (gender, age) => phoneLook(gender, age) + ' Product crisp and true to colour, vertical 9:16.';
// ประโยค "มีคน" ต่อท้าย booster เฉพาะสไตล์ที่ต้องมีพรีเซ็นเตอร์ (รวมฉากหลัง lived-in ไว้ในตัว)
const PERSON_CLAUSE = ' Attractive Thai presenter in a real lived-in place.'; // ผิว/มือจริง อยู่ใน PHONE_LOOK แล้ว
const NO_PERSON_HANDS = ' Show ONLY ONE single person\'s hands interacting with the product — at most a single pair (one or two hands), NEVER three or more hands, no duplicated, cloned, mirrored or floating extra hands, and no other people\'s hands. Absolutely NO face, NO person\'s body, no other people, and NO inset photo, collage, picture-in-picture or extra image anywhere; it is ONE single photograph.';
const NO_PERSON_TABLE = ' Product-only studio shot: no people, hands or face — just the product, beautifully styled.';
// บูสเตอร์ "ภาพถ่ายมือถือจริง" สำหรับช็อตมือ/โกดัง (กันลุค AI จ๋า) — เน้นมือคนจริง ผิวมีเท็กซ์เจอร์ ไม่ commercial
// บล็อกเดียวจบ (booster+avoid รวบสั้น) สำหรับช็อตมือ — ภาพถ่ายมือถือจริงในที่จริง
const HANDS_BLOCK = 'Candid vivo phone photo, lightly edited, in a real home/shop; ONE real hand (5 fingers) holding the SEALED product — no unboxing, no extra hands, no face/people, no sticker/price tag. Natural look (not CGI/3D-render), slight grain, vertical 9:16.';
// สินค้าต้อง "ปิดผนึก" ถือรีวิวเฉยๆ — ใช้กับ hands/warehouse
const PRODUCT_SEALED = ' Product sealed, no unboxing.';
const PRODUCT_STRICT = '(STRICT PRODUCT FIDELITY: Keep 100% the exact real shape, color, label and text of the source product. Do NOT invent, morph, or hallucinate new packaging or new text on the product.)';
const PRODUCT_NEGATIVE = 'unrealistic setting, wrong environment, product floating with no context, multiple duplicated products, distorted product, fake gibberish label text, misspelled text, watermark, signature, username, borders, frame, ugly, plain face, asymmetrical face, distorted face, bad eyes, deformed hands, mutated hands, extra fingers, bad anatomy, blurry, low quality, low resolution, cartoon, 3d render, plastic skin, waxy skin, oversaturated.';
// คำสั่ง "หลีกเลี่ยง" แบบภาษาธรรมชาติ (เหมาะกับ Nano-banana / Grok) — รวบ fidelity + กัน AI จ๋า + photoreal ไว้บล็อกเดียว
// (การคงฉลากสินค้าให้เหมือนรูปจริง อยู่ในคำสั่งรูปแนบของ meta-prompts.js แล้ว)
const PRODUCT_AVOID = 'No fake label, no watermark.'; // ไม่เขียน "no extra text" — Meta AI จะตัดพาดหัวทิ้ง (ไม่เอาพาดหัว = เติม "No on-image text" แยก)
// เวอร์ชัน UGC (ช็อตมือ/โกดัง) — คงความจริงของสินค้า แต่ไม่บังคับลุค "commercial" ที่ทำให้ดู AI
const PRODUCT_AVOID_UGC = 'Keep the product sharp and exactly true to life — do not redesign, morph or duplicate it, and do not put a gibberish or fake label on it. Avoid blur, a cartoon or 3D-render look, oversaturation and watermarks.';
const AVOID_HANDS =' The hand(s) must look like REAL human hands — natural skin with real texture (knuckles, fine lines, natural nails), correct five fingers and natural proportions, NOT smooth plastic, waxy or CGI hands. At most one pair of hands — never three or more, no duplicated or extra hands; do NOT show any face or person\'s body in the frame.';
// บล็อกเดียวจบสำหรับโกดัง — มือถือสินค้า + กองลัง + พื้นโกดังจริง (ถ่ายมือถือ)
const WAREHOUSE_BLOCK = 'Candid vivo phone photo, lightly edited, in a real wholesale warehouse; ONE real hand (5 fingers) holding the SEALED product, a big stack of identical sealed cartons behind, no extra hands, no face/people. Real warehouse floor, natural look (not CGI/3D-render), vertical 9:16.';
const VIDEO_PREFIX = '[ภาษาไทย Thai language] (VIDEO RULE: ONE single continuous shot. Do NOT cut to another scene. Camera may only slow-pan or slow-zoom toward the product in use. If the first frame shows any headline text, it must fully fade out within 3 seconds. No subtitles, no extra on-screen text after that.) ';
// ห่อบทพูดให้เป็นพรอมต์วิดีโอสไตล์ Veo/Flow แบบกระชับ — ให้ "บทพูด" เด่น ไม่ใช่ directive
// vis = personVis ('person' | 'maybe' | 'hands' | 'none') → คุมว่ามี "หน้าคนพูด" ไหม
//   hands/none = เสียงบรรยายนอกจอ (voice-over) ห้ามมีหน้า/ปากขยับ ; person/maybe = พรีเซ็นเตอร์พูดหน้ากล้อง
function wrapVideo(body, seconds, gender, cont, vis) {
  const line = String(body || '').trim();
  const voice = gender ? `Thai ${gender === 'male' ? 'male' : 'female'} voice` : 'Thai voice';
  const cut = cont ? 'continuing from the previous clip (same place, no cut)' : 'single continuous shot';
  const noSub = cont ? LEN.NO_SUBTITLES : LEN.NO_SCREEN_TEXT;

  // มือล้วน / สินค้าล้วน → เสียงบรรยายนอกจอ ห้ามมีหน้า/ปากขยับ
  if (vis === 'hands' || vis === 'none') {
    const seen = vis === 'hands'
      ? 'hands-only using the product, no face/body/other people'
      : 'product only, no people/hands/face';
    const spoken = line.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    return `[ภาษาไทย Thai language] ${seconds}s ${cut}, slow gentle left-right pan (no zoom), ${seen}. Thai voice-over only, off-screen, no talking face: "${spoken}" ${noSub} [Audio: ${voice} voice-over.]`;
  }
  // พรีเซ็นเตอร์พูดหน้ากล้อง — กล้องนิ่งที่เฟรมเดิม (การซูม/แพนเข้าสินค้าทำให้ Meta AI วาดหน้าใหม่ = หน้าเพี้ยน)
  // จึงตัดวงเล็บคำสั่งกล้องในบทพูดออกด้วย
  const spoken = line.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return `[ภาษาไทย Thai language] ${seconds}s ${cut}, still camera at the image's framing (no zoom, no reframing), the presenter talks to the camera, natural Thai lip-sync. "${spoken}" ${noSub} [Audio: ${voice}.]`;
}
const TIKTOK_BANNED = ['100%', 'การันตี', 'รับประกัน', 'รักษา', 'หายขาด', 'ลดน้ำหนัก', 'ผิวขาว', 'ขาวขึ้น', 'ดีที่สุด', 'อันดับ 1', 'ปลอดภัย 100', 'เห็นผลทันที'];

// ตรวจว่าผู้ใช้ระบุ "ราคา/ส่วนลดเป็นตัวเลข" มาไหม (เช่น 99 บาท, ฿120, ราคา 50, ลด 30%, ลด 100)
const PRICE_RE = /฿\s*\d|\d+\s*(?:บาท|฿|baht)|ราคา\s*\d|ลด\s*\d|\d+\s*%/i;
function userGavePrice(text) { return PRICE_RE.test(String(text || '')); }
// คำกระตุ้นไทยใช้แทน "ตัวเลขราคา" เมื่อผู้ใช้ไม่ได้ระบุราคา
const PROMO_WORDS = 'ราคาพิเศษ, โปรวันนี้, ของมีจำกัด, ส่งตรงโรงงาน, สั่งเลย, ห้ามพลาด, ขายดีมาก';
// ป้องกันภาพ "เติมเลขราคาเอง" — ใส่ลง avoid เมื่อผู้ใช้ไม่ได้ระบุราคา (image model ชอบมั่วเลขบนป้าย sale)
const NO_PRICE_NUMBERS = ' Promo signs: Thai words only, no prices/digits/%.';

// สไตล์ตัวหนังสือพาดหัวบนปก — "ลายมือสีขาว มินิมอล" + ดูเดิลเส้นสีขาวเล็กๆ (ไม่ 3D, สุ่มให้หลากหลาย)
const COVER_STYLES = [
  'white handwritten brush-script with a tiny white sparkle ✦ doodle',
  'white handwritten marker text with a small white heart outline ♡',
  'white handwritten script with two tiny white star doodles',
  'white handwritten text with a small white underline swoosh',
  'white handwritten felt-tip text with tiny white sparkle and dot doodles'
];
function pickStyle() { return COVER_STYLES[Math.floor(Math.random() * COVER_STYLES.length)]; }

// สุ่มไม่ซ้ำ (เติมรอบใหม่ถ้าจำนวนเกินพูล)
function shuffled(arr, n) {
  let a = [...arr].sort(() => 0.5 - Math.random());
  while (a.length < n) a = a.concat([...arr].sort(() => 0.5 - Math.random()));
  return a.slice(0, n);
}
// หมายเหตุเฉพาะสไตล์ (ต่อท้ายใบสั่งฉาก)
const STYLE_NOTE = {
  warehouse: '🖐️ โชว์แค่ "มือคู่เดียว" ถือสินค้าโชว์หน้ากล้อง — ❌ ห้ามมีหน้า/ตัวคน/คนขายในภาพเด็ดขาด · 🏟️ พื้นโกดังให้เห็นชัด สวยสมจริงเหมือนถ่ายมือถือ · 📦 ลังทุกใบในกอง/บนชั้นต้องเป็น "สินค้าตัวเดียวกัน" พิมพ์แบรนด์/แพ็กเกจของ [product] เหมือนกันทั้งกอง (❌ ห้ามลังน้ำตาลเปล่า/ยี่ห้ออื่น) · 🪧 ป้ายโปรฯ ตัวหนังสือไทยสะกดถูก อ่านออกชัด (เรื่องราคาดูด้านล่าง) · 🔊 วิดีโอเป็นเสียงบรรยายนอกจอ ไม่มีคนพูดหน้ากล้อง · 📸 ให้เหมือนรูปถ่ายจริง ไม่ใช่ภาพ AI เนียนเกิน',
  hands: '🖐️ โชว์แค่ "มือคู่เดียว" ถือสินค้า (❌ ห้าม 3 มือ/มือซ้ำ/หน้า/ตัวคน/ภาพซ้อน) · 📦 สินค้าปิดผนึก ถือรีวิวเฉยๆ ❌ ห้ามแกะ/เปิดฝา · 🚫 ห้ามมีป้าย/สติกเกอร์/ป้ายราคา แปะบนหรือข้างสินค้า · 📱 ถ่ายมือถือ vivo ในที่จริง (บ้าน/ครัว/ร้าน) แต่งรูปเบาๆ ไม่ใช่สตู/AI',
  holding: '💁 พรีเซ็นเตอร์ต้อง "สวย/หล่อระดับเน็ตไอดอล/นางแบบ" ผิวรีทัชเนียนสวยแต่ "ดูเป็นคนจริง" (ไม่ใช่หน้าบ้านๆ ไม่พลาสติก ไม่ดูเป็นภาพ AI) — สินค้ายังเป็นพระเอก ฉลากชัด · 🏠 ฉากหลังต้อง "เข้ากับสินค้า" = ที่ที่สินค้านี้ถูกใช้/รีวิวจริง (สกินแคร์/เครื่องสำอาง→โต๊ะเครื่องแป้ง/ห้องน้ำ · อาหาร/เครื่องดื่ม→ครัว/โต๊ะกินข้าว · แกดเจ็ต/ของใช้→โต๊ะทำงาน/ในบ้าน/ในรถ · ของเด็ก→ห้องเด็ก · ของออกกำลัง→มุมฟิตเนส) เป็น "ที่จริงในบ้าน/ร้าน" เบลอนุ่ม ไม่ใช่สตูดิโอ — ถ้าฉากหลังในใบสั่งไม่เข้ากับสินค้า ให้เปลี่ยนเป็นที่ที่เหมาะกว่า ทุกชุดเปลี่ยนฉากหลังให้หลากหลาย',
  tabletop: '🍽️ ไม่มีคนในภาพ — สินค้าเป็นพระเอก จัดวางสวยระดับโฆษณา โฟกัสคมที่สินค้า ฉลาก/รายละเอียดชัดเจน'
};

// "ใบสั่งฉาก" รายชุดจากคลังฉากสินค้า (warehouse/hands/holding/tabletop) — ฉากหลายแสน-ล้านแบบ
// omit = พูลที่ไม่ใช้ (เช่น presenter/style เมื่อหน้า/ชุดพรีเซ็นเตอร์ถูกล็อก)
function sceneRecipes(styleKey, count, omit = []) {
  const lib = SCENE_LIB[styleKey];
  if (!lib) return [];
  const keys = Object.keys(lib).filter(k => !omit.includes(k));
  const pools = {};
  for (const k of keys) pools[k] = shuffled(lib[k], count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(keys.map(k => `${POOL_LABELS[k] || k}="${pools[k][i]}"`).join(' | '));
  return out;
}

// พูลที่ต้องตัดออกเมื่อหน้า/ชุดพรีเซ็นเตอร์ถูกล็อก (พูล presenter เป็นผู้หญิงล้วน → ตัดเมื่อพรีเซ็นเตอร์เป็นผู้ชายด้วย)
function sceneOmit(fields) {
  const pv = presenterView(fields);
  const omit = [];
  if (pv.show) omit.push('presenter'); // หน้าพรีเซ็นเตอร์มาจาก thai-look.js (ตามวัย) หรือรูปที่แนบ — ไม่ใช้พูล "presenter(สวย)"
  if (pv.show && pv.outfitLock !== 'free') omit.push('style');
  return omit;
}

// ใบสั่งฉากรายชุด (ไม่มีเลขชุด) — สุ่มครั้งเดียวทั้งก้อน ชุดในก้อนเดียวกันไม่ซ้ำกัน
function planScenes(fields, count, category) {
  if (SCENE_LIB[fields.style]) return sceneRecipes(fields.style, count, sceneOmit(fields));
  return KB.pickContexts(category || KB.GENERIC, count).map(c => {
    const bits = [];
    if (c.persona) bits.push(`คนใช้="${c.persona}"`);
    if (c.action) bits.push(`แอคชั่น="${c.action}"`);
    if (c.scene) bits.push(`ฉากจริง="${c.scene}"`);
    if (c.lighting) bits.push(`แสง="${c.lighting}"`);
    return bits.join(' | ');
  });
}

// พรีเซ็นเตอร์: เห็นหน้าไหม (ตามสไตล์) + เพศ + ล็อกหน้า/ชุด
//   faceLock: none | first (หน้าจากภาพชุดแรก) | library (ลุคจากคลัง + หน้าจากภาพชุดแรก) | photo (รูปที่แนบ)
//   outfitLock: free | first | photo | face_photo (ชุดในรูปหน้า)
function presenterView(f) {
  const style = f.style || '';
  const vis = (style === 'hands' || style === 'warehouse') ? 'hands' : style === 'tabletop' ? 'none' : 'person';
  const gender = f.gender === 'male' || f.gender === 'female' ? f.gender : '';
  return {
    vis, show: vis === 'person', gender, male: gender === 'male',
    faceLock: ['first', 'library', 'photo'].includes(f.faceLock) ? f.faceLock : 'none',
    outfitLock: ['first', 'photo', 'face_photo'].includes(f.outfitLock) ? f.outfitLock : 'free'
  };
}

// สไตล์ภาพ / มุมการขาย (เลือกได้ในโหมดสินค้า) — auto = ให้ระบบคิดฉากเอง
const SHOT_STYLES = {
  hands: {
    label: 'รีวิวเห็นแค่มือกับสินค้า (โคลสอัพ ไม่เห็นหน้า)',
    directive: 'close-up HANDS-ONLY review — one pair of clean hands holding the SEALED, unopened [product] (no opening/unboxing) in tight/medium close-up, no face or body, no sign/sticker on the product. The [product] is the hero, sharp and centered, in a real everyday place (home/kitchen/shop), natural lived-in background, NOT a studio backdrop. Like a genuine vivo phone photo, natural casual UGC look.'
  },
  warehouse: {
    label: 'โกดัง/โรงงาน ลังเพียบ + ป้ายโปรฯ (เห็นแค่มือ ไม่เห็นหน้า)',
    directive: 'viral wholesale warehouse scene — ONLY a single hand holds ONE sealed, unopened [product] up close in front (NO face/body/any person), a HUGE stack of identical sealed [product] cartons piled high behind, on a clean realistic warehouse floor. Add a bold sign with Thai URGENCY WORDS ONLY (โปรวันนี้, ของมีจำกัด, ส่งตรงโรงงาน) — no prices/digits/%. Direct-from-factory vibe, bright warehouse light, realistic depth, like a genuine vivo phone photo, not an AI render.'
  },
  holding: {
    label: 'คนถือโชว์สินค้าใกล้กล้อง (ไลฟ์/รีวิว เห็นหน้า)',
    directive: 'a friendly Thai presenter holding the [product] up close toward the camera, presenting it enthusiastically like an honest live-selling review, upper-body framing, set in a real everyday place (home/cafe/shop) with a natural, slightly lived-in background — NOT a clean studio backdrop, engaging direct-to-camera UGC vibe like a genuine phone video.'
  },
  tabletop: {
    label: 'วางโชว์สตูดิโอ/บนโต๊ะ (โปรดักต์ช็อตสะอาด)',
    directive: 'clean studio product shot — the [product] elegantly placed on a tidy surface or styled tabletop with tasteful matching props, NO person, soft professional studio lighting, premium minimal commercial look, the [product] perfectly in focus.'
  }
};

function buildSystemPrompt(seconds) {
  const wc = LEN.suggestWordCount(seconds);
  return `คุณคือทีมโฆษณามือโปรไทย: Art Director + ครีเอทีฟ TikTok UGC + ช่างภาพโฆษณา + Copywriter
ภารกิจ: ชุดพรอมต์โฆษณา "สินค้า" คลิปสั้นแนวตั้ง 9:16 สมจริง ขายได้ ถ่ายช็อตเดียวต่อเนื่อง

ลำดับคิด (ห้ามข้าม): 1) อ่าน "รายละเอียด/จุดขาย" ผู้ใช้ก่อน = คำสั่งสูงสุด สะท้อนทุกชุด — ถ้าผู้ใช้บอกฉาก/คนใช้/จุดขาย/กลุ่มเป้าหมาย ทำตามนั้น, ไม่บอกค่อยใช้ "บริบทระบบ" ด้านล่าง/อนุมานจากชื่อสินค้า · 2) ฉาก "สมจริงตามฟิสิกส์ 100%" สินค้าอยู่ในที่ที่ถูกใช้จริง ❌ ห้ามวางในที่ไม่เกี่ยว (เช่น น้ำยาซักผ้าในห้องนั่งเล่น/ร้านอาหาร)

กฎเหล็ก: 📦 สินค้า "ปิดผนึก/ยังไม่แกะ" เสมอ รีวิวแบบถือ/โชว์เท่านั้น ❌ ห้ามแกะกล่อง/เปิดฝา/แกะห่อ/เท/บีบออก ทั้งในภาพและบทพูด · persona คนไทยดูจริง น่าเชื่อถือ ผิวสุขภาพดีธรรมชาติ (ไม่โป๊/ไม่เน้นเรือนร่างทางเพศ) · วิดีโอช็อตเดียวต่อเนื่อง ห้ามตัดฉาก ห้ามเขียน "ตัดภาพมาที่"/"เปลี่ยนมุมกล้อง" · บทพูด video_prompt ไทยล้วน 100% ต่อเนื่องเต็ม ~${seconds} วิ = ${wc.min}-${wc.max} คำ พูดพอดีเวลา ~${seconds}-${seconds + 1} วิ ❌ ห้ามห้วน/ช่องเงียบ พุ่งเข้าประเด็น (กระชับ ไม่ยัดเยอะ) · ห้ามใช้คำต้องห้าม TikTok: ${TIKTOK_BANNED.join(', ')} และห้ามโอ้อวดเกินจริง

โครงสร้างแต่ละชุด (ตอบเป็น JSON):
- headline: พาดหัวไทยฮุกสะดุดตา 5-12 คำ (ขึ้นปกคลิป)
- image_prompt: อังกฤษ "สั้นมาก ~15-25 คำ คีย์เวิร์ดคั่นคอมมา" — เฉพาะ [ฉาก/สถานที่จริง] + [แอคชั่นสั้นกับ [product]] + [แสง] + [มุมกล้อง] · ❌ ห้ามบรรยายซ้ำ สินค้าเหมือนจริง/มือ/ปิดผนึก/ภาพจริง/9:16/booster/Negative (ระบบเติมให้หมดแล้ว) · วาง [product] ตรงตำแหน่งสินค้า
- video_prompt: บทพูดไทย UGC — ฮุก → จุดเด่น → ปิดด้วย CTA "กดตะกร้าสีเหลืองด้านซ้ายล่าง" · แทรกวงเล็บแอคชั่นกล้อง 1 ครั้งกลางคลิป: "(กล้องค่อยๆ ซูม/แพนเข้าหาสินค้าแบบต่อเนื่อง ห้ามตัดภาพ)"

ทุกชุดต่างกันจริง (แอคชั่น/มุม/ฮุก) แต่บริบทสินค้าเดียวกัน
ตอบกลับเป็น JSON object เท่านั้น ไม่มีข้อความอื่น`;
}

// opts.recipes = ใบสั่งฉากที่วางไว้แล้ว (เขียนทีละชุด) · opts.usedHeadlines = พาดหัวของชุดก่อนๆ (กันซ้ำ)
function buildUserPrompt(fields, count, seconds, category, opts = {}) {
  const name = (fields.name || '').trim() || '-';
  const details = (fields.details || '').trim();
  const hasDetails = details.length > 0;
  const is16s = !!fields.is16s;
  const wc = LEN.suggestWordCount(seconds);
  const cat = category || KB.GENERIC;
  const plan = opts.recipes && opts.recipes.length === count ? opts.recipes : planScenes(fields, count, cat);
  const perSet = plan.map((r, i) => `  ชุดที่ ${i + 1}: ${r}`);

  const catLine = cat.key === 'generic'
    ? `ระบบจับหมวดสินค้าอัตโนมัติไม่ได้ → ให้คุณวิเคราะห์เองจากชื่อ+รายละเอียดว่าสินค้านี้ "ใช้ที่ไหน ใครใช้ ใช้ยังไง" แล้วล็อกฉากให้สมจริง\n`
    : `หมวดสินค้าที่ระบบวิเคราะห์ได้: "${cat.label}"\n⛔ ห้ามใช้ฉากเหล่านี้ (ไม่สมจริงกับหมวดนี้): ${cat.forbid}\n`;

  const detailLine = hasDetails
    ? `🔴 รายละเอียด/จุดขายจากผู้ใช้ (คำสั่งสูงสุด — ต้องสะท้อนทุกชุด): "${details}"\n   ถ้ารายละเอียดนี้ระบุฉาก/คนใช้/จุดขายชัดเจน ให้ยึดตามนี้ก่อน "ใบสั่งบริบท" ด้านล่าง\n`
    : `ผู้ใช้ไม่ได้กรอกรายละเอียดเพิ่มเติม → ใช้ "ใบสั่งบริบท" ด้านล่าง (อิงการใช้งานจริงของสินค้า)\n`;

  let note16s = '';
  let jsonFmt = `{ "sets": [ { "headline": "...", "image_prompt": "...", "video_prompt": "..." } ] }`;
  if (is16s) {
    note16s =
      `\n🎬 คลิป 16 วิ = 2 ท่อนต่อเนื่อง "แต่ละท่อนพูดเต็ม ~${seconds} วินาทีของตัวเอง" (รวม 2 ท่อน ≈ ${seconds * 2} วิ) — ⚠️ ห้ามเอาบทเดียว ~${seconds} วิ มาหั่นครึ่งใส่ 2 ท่อน! แต่ละท่อนต้องมีคำพอพูดเต็ม ~${seconds} วิ "แยกกันอิสระ":\n` +
      `- video_prompt (ท่อน 1): ต้องยาวเต็ม ~${seconds} วิ = ${wc.min}-${wc.max} คำ "เต็มทั้งท่อน" ❌ ห้ามเป็นแค่ประโยคฮุกสั้นๆ — เปิดด้วยฮุกสะดุด แล้วขยี้ปัญหา/ความอยากของลูกค้าให้ครบจนเต็มเวลา สร้างความอยากรู้ แล้ว "จบค้าง" ด้วยคำเชื่อมให้อยากฟังต่อ (เช่น "...แต่จุดที่หลายคนไม่รู้คือ") ❌ ห้ามเฉลย/ปิดการขายในท่อนนี้\n` +
      `- video_prompt_2 (ท่อน 2): ต้องยาวเต็ม ~${seconds} วิ = ${wc.min}-${wc.max} คำ "เต็มทั้งท่อน" ต่อจากท่อน 1 ทันทีแบบไร้รอยต่อ → เฉลยว่าสินค้าช่วยแก้ยังไง + จุดเด่นเด็ด + สร้างความเร่งด่วน (จำนวนจำกัด/โปรวันนี้) ปิดด้วย CTA แรงๆ "กดตะกร้าสีเหลืองด้านซ้ายล่าง" — ห้ามมีวงเล็บคำสั่งกล้อง\n` +
      `⚖️ สำคัญมาก: ทั้ง 2 ท่อนต้อง ${wc.min}-${wc.max} คำ "เท่าๆ กัน" — แต่ละท่อนพูดเต็ม ~${seconds} วิของตัวเอง อย่าให้ท่อนใดสั้นกว่า และอย่ารวมความยาวแค่ ~${seconds} วิ\n`;
    jsonFmt = `{ "sets": [ { "headline": "...", "image_prompt": "...", "video_prompt": "...", "video_prompt_2": "..." } ] }`;
  }

  // เรื่องราคาบนป้ายโปรฯ: ผู้ใช้ระบุราคามาหรือไม่
  const gavePrice = userGavePrice(`${fields.name || ''} ${details}`);
  const hasPromoPool = !!(SCENE_LIB[fields.style] && SCENE_LIB[fields.style].promo);
  const promoNote = !hasPromoPool ? '' : (gavePrice
    ? `💵 ราคา/ส่วนลด: ใส่ตามที่ผู้ใช้ระบุบนป้ายได้ (ตัวเลข/% ให้ตรงตามที่กรอก สะกดไทยถูก)\n`
    : `💵 ผู้ใช้ "ไม่ได้ระบุราคา" → ❌ ห้ามเขียนตัวเลขราคา/จำนวนเงิน/% บนป้ายหรือสติกเกอร์ใดๆ (ห้ามมั่วราคาเด็ดขาด) ✅ ป้ายโปรฯ ให้ใช้ "คำกระตุ้นไทย" แทน เช่น ${PROMO_WORDS} (สะกดถูก อ่านออกชัด ไม่มีตัวอักษรต่างด้าว/มั่ว)\n`);

  const style = SHOT_STYLES[fields.style];
  const libStyle = SCENE_LIB[fields.style]; // warehouse | hands → ใช้คลังฉากสุ่มผสม
  const pv = presenterView(fields);
  let sceneSection;
  if (libStyle) {
    sceneSection =
      `🎥 สไตล์ภาพบังคับ: ${style.directive}\n` +
      `📸 ทำให้ "เหมือนภาพถ่ายจริง" จากมือถือ/กล้องจริง (candid, authentic UGC, แสงเงาสมจริง ไม่ดูเป็นภาพ AI/เรนเดอร์)\n` +
      `แต่ละชุดใช้ "ใบสั่งฉาก" ที่ต่างกันด้านล่าง — ต้องใส่องค์ประกอบให้ครบทุกตัว ร้อยเรียงลง image_prompt อย่างเนียนสมจริง และวาง [product] ตรงตำแหน่งสินค้าเสมอ:\n` +
      perSet.join('\n') + '\n' +
      (STYLE_NOTE[fields.style] ? STYLE_NOTE[fields.style] + '\n' : '') +
      promoNote;
  } else if (style) {
    sceneSection = `🎥 สไตล์ภาพบังคับทุกชุด (สำคัญสุด — ทับใบสั่งฉากปกติ):\n${style.directive}\nทุกชุดใช้สไตล์นี้เหมือนกัน แต่เปลี่ยนมุมกล้อง/ระยะ/การจัดวาง/แสง ให้หลากหลายไม่ซ้ำ และใส่ [product] ตรงตำแหน่งสินค้าเสมอ\n`;
  } else {
    sceneSection = `ใบสั่งบริบทรายชุด (ร้อยเรียงลง image_prompt อย่างเป็นธรรมชาติ — ทุกฉากต้องสมจริงกับหมวดสินค้า):\n${perSet.join('\n')}\n`;
  }

  const genderLine = pv.gender
    ? `🗣️ ${pv.show ? 'พรีเซ็นเตอร์' : 'เสียงพากย์'}เป็น${pv.male ? 'ผู้ชายไทย — บทพูดลงท้าย "ครับ/ผม" เท่านั้น' : 'ผู้หญิงไทย — บทพูดลงท้าย "ค่ะ/คะ" เท่านั้น'}` +
      (pv.show ? ` · คนในภาพทุกชุดเป็น${pv.male ? 'ผู้ชาย' : 'ผู้หญิง'} (ถ้า "คนใช้" ในใบสั่งเป็นเพศอื่น ให้คงบทบาทเดิมแต่เปลี่ยนเป็นเพศนี้)` : '') + '\n'
    : '';
  // 🔒 ล็อกหน้า/ชุดพรีเซ็นเตอร์ — รูปและคำสั่งล็อกระบบส่งให้ Meta AI เอง ที่นี่กันไม่ให้ image_prompt บรรยายขัดกับรูป
  const lockNotes = [];
  if (pv.show) {
    if (fields.forVideo) lockNotes.push('🎬 ภาพจะถูกทำเป็นคลิปพูด → พรีเซ็นเตอร์หันหน้าเข้ากล้อง มุมครึ่งตัว หน้าใหญ่ชัด ❌ ห้ามหันข้าง/ก้มหน้า/มุมไกล');
    if (pv.faceLock === 'photo') lockNotes.push('🔒 หน้าพรีเซ็นเตอร์ล็อกจาก "รูปหน้าที่ผู้ใช้แนบ" → เรียกแค่ "the presenter" ❌ ห้ามบรรยายหน้าตา/สีผิว/อายุ/ทรงผม/ความสวย ของพรีเซ็นเตอร์');
    else if (pv.faceLock === 'first' || pv.faceLock === 'library' || opts.whoGiven) lockNotes.push('🔒 หน้าตา/อายุ/ทรงผมพรีเซ็นเตอร์ ระบบใส่ให้เอง → เรียกแค่ "the presenter" ❌ ห้ามบรรยายหน้าตา ทรงผม อายุ ความสวย/หล่อ (young, beautiful, handsome)');
    if (pv.outfitLock === 'photo' || pv.outfitLock === 'face_photo') lockNotes.push('🔒 ชุดพรีเซ็นเตอร์ล็อกจากรูปที่ผู้ใช้แนบ → ❌ ห้ามบรรยายเสื้อผ้า/เครื่องประดับของพรีเซ็นเตอร์');
    else if (pv.outfitLock === 'first') lockNotes.push('🔒 พรีเซ็นเตอร์ใส่ชุดเดิมทุกชุด (ระบบใช้ชุดจากภาพชุดแรก) → ❌ ห้ามบรรยายเสื้อผ้าที่ต่างกันในแต่ละชุด');
  }
  if (opts.handGiven) lockNotes.push('✋ ลักษณะมือ (สีผิว เล็บ แขนเสื้อ เครื่องประดับ) ระบบกำหนดให้เอง ❌ ห้ามบรรยายมือ เล็บ แขนเสื้อ');
  const lockLine = lockNotes.length ? lockNotes.join('\n') + '\n' : '';
  const used = (opts.usedHeadlines || []).filter(Boolean);
  const usedNote = used.length ? `\n🔁 ชุดก่อนๆ ใช้พาดหัว/ฮุกเหล่านี้ไปแล้ว ❌ ห้ามซ้ำหรือคล้าย: ${used.map(u => `"${u}"`).join(', ')}\n` : '';

  // ผู้ใช้จะแนบรูปสินค้าจริง → ห้าม LLM มโนรูปลักษณ์สินค้าเอง (เดี๋ยวขัดกับรูปจริง → สินค้าเพี้ยน)
  const refProductNote = fields.hasProductRef
    ? `\n📷 สำคัญ: ผู้ใช้จะ "แนบรูปสินค้าจริง" ตอนสร้างภาพ → ในทุก image_prompt ให้อ้างถึงสินค้าเป็นคำว่า "[product]" เท่านั้น ❌ ห้ามบรรยายรูปลักษณ์/สี/รูปทรง/ฉลาก/โลโก้/ข้อความบนตัวสินค้าเอง (รูปที่แนบคือความจริง — ถ้าบรรยายเองภาพจะเพี้ยนจากของจริง) ✅ บรรยายได้แค่ "ตำแหน่งวาง/การถือ/แอคชั่น/ฉากรอบๆ" เท่านั้น\n`
    : '';

  return (
    `สินค้า: "${name}"\n` + detailLine + catLine + `\n` +
    `🎯 งาน: สร้าง ${count} ชุดโฆษณา UGC แนวตั้ง 9:16 ถ่ายช็อตเดียวต่อเนื่อง\n` +
    `⏱️ บทพูดแต่ละท่อนต้อง "พูดเต็มเวลา ~${seconds}-${seconds + 1} วินาที" (≈ ${wc.min}-${wc.max} คำ) — ❌ ห้ามสั้น/ห้ามห้วน ให้พูดต่อเนื่องลื่นไหลจนเต็มเวลา ไม่มีช่องเงียบ (ยาวไว้ดีกว่าสั้น)\n` + genderLine + `\n` +
    sceneSection + refProductNote + lockLine + note16s + usedNote +
    `\nรูปแบบ JSON: ${jsonFmt}\nต้องมี sets เท่ากับ ${count} พอดี`
  );
}

function parseSets(content) {
  // ทนทาน: กู้ชุดที่ปิดครบแม้ output ถูกตัดกลางคัน + ซ่อม newline ดิบในสตริง
  const sets = salvageSets(content, { arrayKeys: ['sets', 'data', 'results'] });
  if (!sets.length) throw new Error('อ่านผลลัพธ์จาก AI ไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง)');
  return sets.map(s => ({
    headline: String(s.headline || s.title || '').trim(),
    image_prompt: String(s.image_prompt || s.image || s.imagePrompt || '').trim(),
    video_prompt: String(s.video_prompt || s.video || s.script || '').trim(),
    video_prompt_2: String(s.video_prompt_2 || s.video2 || s.script2 || '').trim()
  })).filter(s => s.image_prompt || s.video_prompt);
}

function applyPostProcess(sets, productName, opts = {}) {
  const seconds = opts.seconds || 8;
  const hasRef = !!opts.hasProductRef;
  const withHeadline = opts.withHeadline !== false;
  const personLook = (opts.personLook || '').trim();
  // การมองเห็น "คน" ในภาพตามสไตล์: hands & warehouse = มือล้วน (ไม่มีหน้า) · tabletop = ไม่มีคน · อื่นๆ = พรีเซ็นเตอร์เห็นหน้า
  // คำสั่งล็อกสินค้า/หน้า/ชุดจากรูปที่แนบอยู่ใน lib/meta-prompts.js (ใส่ตอนส่งให้ Meta AI)
  const style = opts.style || '';
  const isWarehouse = style === 'warehouse';
  const pv = presenterView(opts);
  const personVis = pv.vis;
  const allowPerson = pv.show;
  const personClause = !allowPerson ? '' : pv.faceLock === 'photo'
    ? ' Presenter = the reference person, in a real lived-in place.'
    : personLook ? ' Presenter in a real lived-in place.' // หน้าตา/อายุอยู่ใน "Presenter: ..." แล้ว ไม่ใส่ "Attractive"
    : PERSON_CLAUSE.replace('Thai presenter', pv.gender ? `Thai ${pv.male ? 'male' : 'female'} presenter` : 'Thai presenter');
  // ภาพที่จะทำเป็นคลิปพูด: หน้าพรีเซ็นเตอร์ต้องใหญ่ ชัด หันเข้ากล้อง
  const frameTalk = allowPerson && opts.forVideo ? ' Upper body, presenter\'s face large and facing the camera, product clearly visible.' : '';
  return sets.map(s => {
    // ตัดคำ "AI จ๋า" ก่อนใส่ชื่อสินค้า (ชื่อสินค้าของผู้ใช้ต้องคงเดิม เช่น "Perfect Whitening")
    let img = deAI(s.image_prompt).replace(/\[product\]/gi, productName || 'the product');
    if (personLook && allowPerson) img = `Presenter: ${deAI(personLook)}. ${img}`;
    if (opts.hand && (style === 'hands' || isWarehouse)) img = `Hand: ${opts.hand}. ${img}`; // มือคนละแบบทุกชุด
    const cover = (s.headline || '').trim();
    if (withHeadline && cover) {
      // "Small…" alone came out tiny and unreadable on Meta AI (tested 2026-10-04); the size + shadow wording reads well
      img = `Minimal headline at the top-left: "${cover}" in ${pickStyle()}, big enough to read on a phone (about 1/12 of the image height), with a soft shadow so it stands out; not covering the product, correct Thai spelling. ${img}`;
    }
    // booster + avoid (รวบเป็นบล็อกเดียวต่อสไตล์ — กันพรอมต์ยาว)
    let boosters, avoid = '';
    if (style === 'hands') {
      boosters = HANDS_BLOCK;
    } else if (isWarehouse) {
      boosters = WAREHOUSE_BLOCK;
    } else {
      // มีพรีเซ็นเตอร์ = ลุคอินฟลูไทย · ไม่มีคน = แต่งสีเบาๆ (PERSON_CLAUSE รวมฉากหลัง lived-in ไว้แล้ว)
      if (personVis === 'person') boosters = personBoosters(pv.gender, opts.age) + personClause + frameTalk;
      else boosters = PRODUCT_BOOSTERS + (personVis === 'none' ? NO_PERSON_TABLE : '');
      // PRODUCT_AVOID รวบ fidelity + กัน AI จ๋า + photoreal ไว้ในตัวแล้ว
      avoid = PRODUCT_AVOID + PRODUCT_SEALED;   // รีวิว = ปิดผนึก ห้ามแกะ/เปิด (มือ/โกดังคุมในบล็อกแล้ว)
    }
    if (!withHeadline) avoid += ' No on-image text or lettering.';
    if (opts.noPriceNumbers && isWarehouse) avoid += NO_PRICE_NUMBERS;  // มีป้ายโปรฯ แค่ฉากโกดัง
    // เสริมเฉพาะโกดัง: ลังต้องเป็นสินค้าเดียวกัน
    let extra = '';
    if (isWarehouse) {
      const pn = productName || 'the product';
      extra += ` Every stacked box is the SAME ${pn} product (identical branding, not blank/other brands${hasRef ? ', matching the attached photo' : ''}).`;
    }
    img = `${img} ${boosters} ${avoid}${extra}`;
    const fit1 = LEN.fitToSeconds(s.video_prompt || '', seconds);
    const out = {
      headline: cover, image_prompt: img.trim(), video_prompt: wrapVideo(fit1.text, seconds, opts.gender, false, personVis).trim(),
      video_seconds: fit1.seconds, video_trimmed: fit1.trimmed
    };
    if (s.video_prompt_2) {
      const fit2 = LEN.fitToSeconds(s.video_prompt_2, seconds);
      out.video_prompt_2 = wrapVideo(fit2.text, seconds, opts.gender, true, personVis).trim();
      out.video_seconds_2 = fit2.seconds; out.video_trimmed_2 = fit2.trimmed;
    }
    return out;
  });
}

export {
  PRODUCT_BOOSTERS, PRODUCT_STRICT, PRODUCT_NEGATIVE, VIDEO_PREFIX, TIKTOK_BANNED, SHOT_STYLES,
  planScenes, buildSystemPrompt, buildUserPrompt, parseSets, applyPostProcess, userGavePrice
};
