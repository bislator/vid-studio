'use strict';
/* ============================================================
 *  persona-engine.js — ตรรกะโหมดสร้างตัวตน (ฉบับสุภาพ, เทสต์ได้)
 *  - ตัวแบบดูดี/ดูโปร แต่ "ไม่เน้นเรือนร่างทางเพศ"
 *  - ข้อความบนภาพ = ผู้ใช้พิมพ์เอง (ชื่อช่อง/สโลแกน) ไม่ใช่โปรไฟล์หาคู่
 *  - คุมความยาวบทพูดด้วย script-length.js เหมือนโหมดสินค้า
 * ============================================================ */
import * as KB from './persona-knowledge.js';
import * as LEN from './script-length.js';
import { salvageSets } from './json-salvage.js';
import { phoneLook, deAI } from './phone-look.js';

// บูสเตอร์ความสวย/หล่อแบบ "อินฟลูไทย" — ใช้เมื่อไม่มีหน้าจาก thai-look.js (opts.who) และไม่ได้ล็อกหน้าจากรูป
// (ลุคเน็ตไอดอล Douyin ใน Meta AI ได้หน้าตุ๊กตา ดูเป็น AI — ผู้ใช้ไม่เอา)
const BEAUTY_FEMALE = 'A beautiful young Thai TikTok influencer with glam-but-natural Thai makeup and a bright natural smile.';
const BEAUTY_MALE = 'A handsome young Thai TikTok influencer, well-groomed, with a bright natural smile.';
// ใบหน้าล็อกจากรูปที่แนบ → ห้ามบูสเตอร์บรรยายหน้าตา (ไม่งั้น Meta AI จะ "แต่งหน้าใหม่" จนไม่เหมือนรูป)
const BEAUTY_REF_FEMALE = 'Natural makeup, neat hair; face exactly as the reference.';
const BEAUTY_REF_MALE = 'Neat well-groomed look; face exactly as the reference.';
const FACE_LOCKS = ['none', 'first', 'photo'];
const OUTFIT_LOCKS = ['free', 'first', 'photo', 'face_photo'];
const faceLockOf = (f) => (FACE_LOCKS.includes(f.faceLock) ? f.faceLock : 'none');
const outfitLockOf = (f) => (OUTFIT_LOCKS.includes(f.outfitLock) ? f.outfitLock : 'free');

const NEGATIVE = 'ugly, plain face, asymmetrical face, distorted face, bad eyes, cross-eyed, deformed iris, acne, pimples, blemishes, dark spots, rough skin, dull skin, plastic skin, waxy skin, blurry, low quality, low resolution, pixelated, 3d render, cartoon, anime, deformed, disfigured, mutated hands, extra fingers, fused fingers, extra limbs, bad anatomy, watermark, signature, text, typography, intro text, subtitles, gibberish text, misspelled text, nsfw, nude, oversexualized body, exaggerated body proportions.';
const NEGATIVE_TEXT = 'ugly, plain face, asymmetrical face, distorted face, bad eyes, acne, pimples, blemishes, dull skin, plastic skin, blurry, low quality, low resolution, 3d render, cartoon, deformed, disfigured, mutated hands, extra fingers, fused fingers, bad anatomy, watermark, signature, floating text, gibberish text, misspelled text, nsfw, nude, oversexualized body, exaggerated body proportions.';
// คำสั่ง "หลีกเลี่ยง" แบบภาษาธรรมชาติ (รวบ photoreal + กัน AI จ๋า ไว้ในตัว — ไม่ซ้อน PHOTOREAL/ANTI_AI)
// ท่า = โพสให้เพื่อนถ่ายรูปธรรมดา มือวางสบายๆ (ผู้ใช้ 2026-10-04: ไม่เอาชูมือ/โบกมือ/ทำท่าทาง)
const POSE_RULE = 'Simple photo pose with natural, relaxed hands (no waving, no peace sign, no raised hands)';
const AVOID = `${POSE_RULE}; no text or watermark; tasteful outfit; vertical 9:16.`;
const AVOID_TEXT = `${POSE_RULE}; no watermark; the only text is the Thai caption, spelled correctly; tasteful outfit; vertical 9:16.`;
// ห่อบทพูดให้เป็นพรอมต์วิดีโอสไตล์ Veo/Flow แบบกระชับ — ให้ "บทพูด" เด่น ไม่ใช่ directive
// ล็อกเพศของเสียงพากย์ให้ตรงกับตัวแบบในภาพ
// กล้องต้อง "นิ่งที่เฟรมเดิมของภาพ": คำว่า selfie/ซูมเข้า ทำให้ Meta AI จัดเฟรมใหม่แล้ววาดหน้าใหม่ = หน้าไม่เหมือนภาพ
function wrapVideo(body, seconds, gender, cont) {
  const line = String(body || '').trim();
  const v = gender === 'male' ? 'male' : 'female';
  const camera = 'still camera at the image\'s framing (no zoom, no reframing)';
  if (cont) {
    // ฉาก 2 ของคลิป 2 ท่อน — ต่อเนื่องจากท่อนแรก ไม่มีปกให้เฟด ใช้แค่ "ห้ามมีซับ"
    return `[ภาษาไทย Thai language] ${seconds}s continuing from the previous clip (same person/place, no cut), ${camera}, the Thai ${v} keeps talking to the camera, natural lip-sync. "${line}" ${LEN.NO_SUBTITLES} [Audio: Thai ${v} voice.]`;
  }
  return `[ภาษาไทย Thai language] ${seconds}s single continuous shot, ${camera}, the Thai ${v} talks to the camera, natural lip-sync. "${line}" ${LEN.NO_SCREEN_TEXT} [Audio: Thai ${v} voice.]`;
}

// ภาพที่จะทำเป็นคลิปพูด: หน้าต้องใหญ่ ชัด หันเข้ากล้อง — หน้าเล็ก/หันข้าง วิดีโอจะวาดหน้าใหม่จนไม่เหมือน
const FRAME_TALK = 'Chest-up, face large, sharp and facing the camera.';
const TALK_ANGLES = [
  'eye-level chest-up shot',
  'slightly low-angle chest-up shot',
  'eye-level waist-up medium close-up',
  'straight-on head-and-shoulders framing',
  'slightly high-angle chest-up shot',
  'three-quarter turn of the body, face toward the camera, chest-up'
];

// ฉาก/แสง/โทน/มุมกล้อง แบบ "รูปมือถือจริงในไทย" — แทนคลังเดิมของ promptgen (คาเฟ่สไตล์เกาหลี, golden hour,
// cinematic rim light, teal & orange, bokeh) ที่ทำให้ภาพออกมาเป็นหน้าไอดอลเกาหลี แสงทอง หลังเบลอ = ดูเป็น AI
// ท่าโพสถ่ายรูปธรรมดา หันหน้าเข้ากล้อง (ใช้ได้ทั้งภาพนิ่งและคลิปพูด) — แทน KB.POSES ที่มีท่าทาง (ยืดแขน ใส่แว่น จับผม ทำมือประกอบ)
const PHOTO_POSES = [
  'standing relaxed and smiling at the camera, arms down naturally', 'standing with hands lightly clasped in front, soft smile at the camera',
  'one hand in a pocket, relaxed smile at the camera', 'slight head tilt, gentle smile at the camera, hands relaxed',
  'sitting relaxed with hands on the lap, smiling at the camera', 'leaning lightly on a railing with both hands resting on it, smiling at the camera',
  'body turned slightly, face toward the camera, calm smile', 'one hand holding a bag strap on the shoulder, natural smile at the camera',
  'sitting at a table with hands resting on it, smiling at the camera', 'standing straight, posing for a photo with a bright smile',
  'arms relaxed at the sides, soft closed-mouth smile', 'standing by a wall in a relaxed pose, looking at the camera',
  'sitting on a step with hands resting on the knees, smiling at the camera', 'standing with weight on one leg, relaxed, smiling at the camera',
  'holding a cup in both hands at waist height, smiling at the camera', 'sitting sideways on a chair, face toward the camera, gentle smile',
];
const REAL_PLACES = [
  'the front porch of a wooden Thai house by a green rice field', 'a small Thai coffee shop with a handwritten Thai menu',
  'a school corridor with classroom doors', 'a classroom with a whiteboard and student desks', 'a Thai street-food market with stalls',
  'a temple courtyard with white walls and gold trim', 'a wooden riverside pier', 'a village road with motorbikes and banana trees',
  'a home living room with a tiled floor and a sofa', 'a condo balcony with a city view', 'a busy university canteen',
  'a roadside noodle shop with steel tables', 'a mango orchard', 'a shopping-mall walkway', 'a BTS skytrain platform',
  'a beach with long-tail boats', 'a mountain viewpoint in northern Thailand with misty hills', 'a fresh flower market',
  'a home kitchen with a gas stove and pots', 'a small-town street with old shophouses', 'an office desk with a laptop and plants',
  'a front yard with potted plants and a parked motorbike', 'a night market just before dark', 'a park with a lake and joggers',
  'the front of a convenience store', 'a garden with hanging orchids', 'the front seat of a car with the window open',
  'a bedroom with a vanity table and mirror', 'a fruit stall piled with fruit', 'a tea plantation on a hillside', 'a small hair salon',
  'a farm with rice-straw bales', 'a wooden riverside café', 'a sala pavilion by a lotus pond', 'a floating market boat',
  'a school sports field', 'a coconut grove', 'a library with tall bookshelves', 'a hotel lobby', 'a boutique clothing shop',
];
const REAL_LIGHTS = [
  'soft overcast daylight', 'bright cloudy-day light', 'open shade on a sunny day', 'morning daylight', 'bright midday light under a roof',
  'window daylight indoors', 'indoor ceiling lights plus daylight from the door', 'afternoon daylight',
  'shade under a tree', 'even daylight after rain',
];
const REAL_TONES = ['true colours', 'true colours, slightly bright', 'everyday natural colours', 'clean bright colours', 'fresh daylight colours', 'soft natural colours'];
const REAL_ANGLES = [
  'eye-level waist-up shot', 'eye-level chest-up shot', 'slightly high-angle waist-up shot', 'eye-level half-body shot',
  'slightly low-angle waist-up shot', 'eye-level knee-up shot', 'three-quarter turn of the body, face toward the camera, waist-up',
  'straight-on half-body shot',
];
const AWAY_POSE = /walking|over the shoulder|looking up|balcony|stretching|sunglasses|focused on work|mid-action|leaning lightly against/;

function shuffled(arr, n) {
  let a = [...arr].sort(() => 0.5 - Math.random());
  while (a.length < n) a = a.concat([...arr].sort(() => 0.5 - Math.random()));
  return a.slice(0, n);
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ใบสั่งฉากรายชุด (ท่าทาง/สถานที่/มุมกล้อง/แสง/โทนสี/อารมณ์) — สุ่มครั้งเดียวทั้งก้อน ชุดในก้อนเดียวกันไม่ซ้ำกัน
// คลิปพูด (forVideo) ใช้แค่ท่าที่หันหน้าเข้ากล้อง + มุมครึ่งตัว
function planScenes(fields, count) {
  const talk = !!fields.forVideo;
  const poses = shuffled(PHOTO_POSES.filter(p => !talk || !AWAY_POSE.test(p)), count);
  const locs = shuffled(REAL_PLACES, count);
  const angles = shuffled(talk ? TALK_ANGLES : REAL_ANGLES, count);
  const times = shuffled(REAL_LIGHTS, count);
  const palettes = shuffled(REAL_TONES, count);
  const emotions = shuffled(KB.EMOTIONS, count);
  return Array.from({ length: count }, (_, i) => ({ pose: poses[i], loc: locs[i], angle: angles[i], time: times[i], palette: palettes[i], emotion: emotions[i] }));
}

function buildSystemPrompt(seconds) {
  const wc = LEN.suggestWordCount(seconds);
  return `คุณคือผู้กำกับ+ช่างภาพ+Art Director เขียน Prompt AI ภาพ/วิดีโอ ระดับโปรดักชัน
งาน: ชุดคอนเทนต์ "สร้างตัวตน/คาแรกเตอร์" คลิปสั้นแนวตั้ง 9:16 ดูโปร หลากหลายไม่ซ้ำ

วิธีคิด: อ่านคาแรกเตอร์+รายละเอียดผู้ใช้ → เลือกชุด/ฉาก/ท่าทาง/แสง/มุมกล้องให้เข้าคาแรกเตอร์ที่สุด ดูโปร · ทุกชุดต้องต่างกันจริง (ฉาก/ท่าทาง/มุมกล้อง/แสง/อารมณ์)

ความสวย/หล่อ: สาว/หนุ่ม "อินฟลูไทยใน IG/TikTok" ที่ดูเป็นคนจริง — หน้าสวย ยิ้มสดใส แต่งหน้า+ทรงผมสวยแบบไทย มั่นใจมีเสน่ห์ ห้ามหน้าธรรมดา · ทำตาม "ลุค" ผู้ใช้เป๊ะ (เซ็กซี่/เปรี้ยว/หุ่นดี/อกโตได้แบบมีรสนิยม ยังใส่เสื้อผ้าเรียบร้อย ไม่โป๊)
📱 ลุคภาพ = "รูปที่เพื่อนถ่ายด้วยมือถือ แบบโพสต์เฟซบุ๊กของสาวสวย/หนุ่มไทย" (ระบบเติมคำสั่งลุคให้เอง): แสงกลางวันเรียบๆ ฉากชีวิตจริงในไทยที่มีรายละเอียด ฉากหลังชัด ❌ ห้ามคำที่ทำให้ภาพดูเป็น AI: cinematic, dramatic, chiaroscuro, moody, golden hour, bokeh, blurred background, rim light, film look, Korean-style, studio lighting, flawless, perfect, glowing/radiant, aura, ultra-realistic, 8k, masterpiece

กฎใบหน้า: ❌ ห้ามเขียนวลีล็อกหน้า/identity/consistent เอง (ระบบแนบรูปต้นแบบให้ Meta AI เอง) · คนละคน → ให้หน้า/รูปร่างต่างกันทุกชุด

image_prompt — "อังกฤษ" สั้น ~15-25 คำ คีย์เวิร์ดคั่นคอมมา เรียง: subject (a Thai woman/man) → stylish outfit ตามธีม + ลุคเฉพาะที่ผู้ใช้สั่ง (เซ็กซี่/หุ่นดีถ้าสั่ง) → ท่าโพสถ่ายรูปตามใบสั่ง → specific location → natural lighting → phone framing (medium shot, eye-level)
🧍 ท่าทาง = ยืน/นั่งโพสให้เพื่อนถ่ายรูปธรรมดา มือวางสบายๆ ❌ ห้ามชูมือ โบกมือ ชูสองนิ้ว มินิฮาร์ท ชี้นิ้ว ยกแขน จับผม/จับหน้า หรือทำมือประกอบ
❌ ห้ามบรรยายซ้ำความสวย/ผิวเนียน/net-idol ทั่วไป (ระบบเติม BEAUTY ให้แล้ว) ❌ ห้าม booster/Negative/ข้อความบนภาพ (ระบบเติมให้เอง)
🔒 ถ้าคำสั่งมีหมายเหตุ "ล็อกหน้า/ล็อกชุด" ให้ทำตามเป๊ะ (ทับลำดับด้านบน) — ระบบแนบรูปและเขียนคำสั่งล็อกให้ Meta AI เอง ❌ ห้ามเขียนคำว่า reference/attached photo เอง

video_prompt — "ไทย" บทพูดต่อเนื่องเต็ม ~${seconds} วิ = ${wc.min}-${wc.max} คำ พูดเต็มเวลา ~${seconds}-${seconds + 1} วิ ❌ ห้ามสั้น/ห้วน ไม่มีช่องเงียบ ลื่นไหลเป็นกันเองสดใส (ยาวไว้ดีกว่าสั้น) · ❌ ห้ามขึ้นต้น "สวัสดี" · ✅ ลงท้ายสุภาพ · ❌ ห้ามใส่แท็ก Audio หรือ [ภาษาไทย...] เอง (ระบบเติมให้)

ตอบเป็น JSON object เท่านั้น ไม่มีข้อความอื่น`;
}

// opts.recipes = ใบสั่งฉากที่วางไว้แล้ว (เขียนทีละชุด) · opts.usedLines = ประโยคเปิดบทพูดของชุดก่อนๆ (กันซ้ำ)
function buildUserPrompt(fields, count, seconds, usedOverlays = [], opts = {}) {
  const name = (fields.name || '').trim() || '-';
  const details = (fields.details || '').trim();
  const hasDetails = details.length > 0;
  const is16s = !!fields.is16s;
  const wc = LEN.suggestWordCount(seconds);

  const genderTh = fields.gender === 'male' ? 'ผู้ชายไทย (Thai man)' : 'ผู้หญิงไทย (Thai woman)';
  const skin = fields.skinTone || 'natural healthy Thai skin tone';
  const themeHint = KB.THEMES[fields.theme] || KB.THEMES.random;

  const talk = !!fields.forVideo;
  const recipes = opts.recipes && opts.recipes.length === count ? opts.recipes : planScenes(fields, count);
  const poses = recipes.map(r => r.pose), locs = recipes.map(r => r.loc), angles = recipes.map(r => r.angle);
  const times = recipes.map(r => r.time), palettes = recipes.map(r => r.palette), emotions = recipes.map(r => r.emotion);

  // 🔒 ล็อกหน้า/ล็อกชุด — รูปและคำสั่งล็อกระบบส่งให้ Meta AI เอง ที่นี่แค่กันไม่ให้ image_prompt บรรยายขัดกับรูป
  const faceLock = faceLockOf(fields);
  const outfitLock = outfitLockOf(fields);
  const subject = fields.gender === 'male' ? 'a Thai man' : 'a Thai woman';
  const locks = [];
  if (faceLock === 'photo') locks.push(`🔒 ล็อกหน้าจาก "รูปหน้าที่ผู้ใช้แนบ" → subject เขียนแค่ "${subject}" ❌ ห้ามบรรยายหน้าตา/สีผิว/อายุ/รูปร่าง/สีผม (ทุกอย่างของใบหน้ามาจากรูป)`);
  else if (faceLock === 'first') locks.push('🔒 คนเดิมทุกชุด — ระบบใช้หน้าจากภาพชุดแรกเป็นต้นแบบให้ชุดถัดไปเอง → ❌ ห้ามบรรยายหน้าตา/ทรงผม/สีผม ที่ต่างกันในแต่ละชุด');
  if (outfitLock === 'photo') locks.push('🔒 ล็อกชุดจาก "รูปชุดที่ผู้ใช้แนบ" → ❌ ห้ามบรรยายเสื้อผ้า/เครื่องประดับ/รองเท้า ใน image_prompt — ธีมใช้กำหนดแค่ฉาก/บรรยากาศ/ท่าทาง');
  else if (outfitLock === 'face_photo') locks.push('🔒 ล็อกทั้งลุคจาก "รูปคนเต็มตัวที่ผู้ใช้แนบ" (หน้า+ทรงผม+ชุด) → ❌ ห้ามบรรยายเสื้อผ้า/เครื่องประดับ/ทรงผม — เขียนแค่ท่าทาง/ฉาก/แสง/มุมกล้อง');
  else if (outfitLock === 'first') locks.push('🔒 ชุดเดิมทุกชุด → คิด "ชุดเดียว" ที่เข้าธีม แล้วบรรยายชุดนั้นด้วยถ้อยคำเดียวกันเป๊ะทุกชุด (ระบบใช้ชุดจากภาพชุดแรกเป็นต้นแบบให้ชุดถัดไป) — เปลี่ยนแค่ท่าทาง/ฉาก/แสง/มุมกล้อง');
  if (opts.whoFromLibrary) locks.push('💄 หน้าตา/อายุ/ทรงผม/แต่งหน้า/สีผิว ระบบใส่ให้เอง → image_prompt ขึ้นต้นด้วยชุดเลย ❌ ห้ามเขียน subject (a Thai woman/man) ❌ ห้ามบรรยายหน้าตา ผม แต่งหน้า ผิว ❌ ห้ามคำบอกวัย (young, youthful, teen) — ชุด/ท่าทาง/ฉากให้เหมาะกับวัยในรายละเอียด');
  if (talk) locks.push('🎬 ภาพนี้จะถูกทำเป็นคลิปพูดหน้ากล้อง → ทุกชุดใช้มุม "อกขึ้นไป/ครึ่งตัว" หน้าใหญ่ชัด หันหน้าเข้ากล้อง ❌ ห้ามเต็มตัว/มุมไกล/หันข้าง/ข้ามไหล่/มองไปทางอื่น (หน้าเล็กหรือหันข้าง = คลิปหน้าเพี้ยน)');
  const refNote = locks.length ? '\n' + locks.join('\n') : '';
  const noOutfit = outfitLock !== 'free';
  const lockFace = faceLock !== 'none';
  const sameOrNew = lockFace ? 'คงเป็น "คนเดิม" ทุกชุด (หน้าตาเหมือนกัน)' : 'แต่ละชุดเป็น "คนละคน" (ห้ามใส่วลีล็อกหน้า)';

  const aiOverlay = !!fields.aiOverlay;
  const overlayHint = (fields.overlayText || '').trim();
  // "คำหลัก" = คำแรกที่ผู้ใช้พิมพ์ (เมื่อเปิดโหมด AI) → บังคับมีทุกชุด + เด่นกว่าคำอื่น
  const overlayAnchor = aiOverlay && overlayHint ? overlayHint.split(/\s+/)[0] : '';
  let jsonFmt = `{ "sets": [ { "image_prompt": "...", "video_prompt": "..."${is16s ? ', "video_prompt_2": "..."' : ''}${aiOverlay ? ', "overlay_text": "..."' : ''} } ] }`;
  let note16s = '';
  if (is16s) {
    note16s =
      `\n🎬 โหมดคลิปยาว 2 ท่อน — "แต่ละท่อนพูดเต็ม ~${seconds} วิของตัวเอง" (⚠️ ห้ามหั่นบทเดียว ~${seconds} วิ มาใส่ 2 ท่อน):\n` +
      `- video_prompt = ท่อน 1: เปิดเรื่อง/ฮุก เล่าให้เต็ม ~${seconds} วิ (${wc.min}-${wc.max} คำ "เต็มทั้งท่อน" ห้ามสั้นห้วน) แล้วจบค้างด้วยคำเชื่อม ห้ามปิด\n` +
      `- video_prompt_2 = ท่อน 2: บทพูดล้วนต่อจากท่อนแรกจนจบ เต็ม ~${seconds} วิ (${wc.min}-${wc.max} คำ) ปิดสุภาพ — ห้ามมีวงเล็บคำสั่งกล้อง\n`;
  }

  const particleRule = fields.gender === 'male'
    ? 'ผู้ชาย — ลงท้าย "ครับ/ผม" เท่านั้น ห้ามใช้ ค่ะ/คะ/หนู/ดิฉัน'
    : 'ผู้หญิง — ลงท้าย "ค่ะ/คะ" เท่านั้น ห้ามใช้ ครับ/ผม';

  let body =
    `คาแรกเตอร์: "${name}"\n` +
    `เพศ/ตัวแบบ: ${genderTh}\n` +
    `🗣️ บทพูดต้องเป็นน้ำเสียง${genderTh} ใช้สรรพนาม/คำลงท้ายให้ตรงเพศ: ${particleRule}\n` +
    `โทนสีผิว: ${faceLock === 'photo' ? 'ตามรูปหน้าที่แนบ (ห้ามบรรยาย)' : skin}\n` +
    `แนวทางธีม (การแต่งกาย+ฉาก): ${themeHint}\n` +
    (hasDetails ? `รายละเอียดเพิ่มเติมจากผู้ใช้: "${details}"` : `ผู้ใช้ไม่ได้ใส่รายละเอียดเพิ่มเติม`) +
    refNote + `\n\n` +
    `⏱️ บทพูดแต่ละท่อนต้อง "พูดเต็มเวลา ~${seconds}-${seconds + 1} วินาที" (≈ ${wc.min}-${wc.max} คำ) ❌ ห้ามสั้น/ห้ามห้วน (ยาวไว้ดีกว่าสั้น)\n\n`;

  if (hasDetails) {
    body +=
      `🔴 "รายละเอียดเพิ่มเติม" คือคำสั่งสูงสุด ต้องนำไปใช้อย่างแนบเนียน\n` +
      `สร้าง ${count} ชุด ${sameOrNew} คงแกนหลักตามผู้ใช้สั่ง แต่เปลี่ยนท่าทาง/มุมกล้อง/แสง/อารมณ์ ให้หลากหลาย\n` +
      `ไอเดียสลับแต่ละชุด: ท่าทาง=[${poses.join(' | ')}] · มุมกล้อง=[${angles.join(' | ')}] · แสง=[${times.join(' | ')}] · โทนสี=[${palettes.join(' | ')}]\n`;
  } else {
    const perSet = [];
    for (let i = 0; i < count; i++) {
      perSet.push(`  ชุดที่ ${i + 1}: ท่าทาง="${poses[i]}" | สถานที่="${locs[i]}" | มุมกล้อง="${angles[i]}" | แสง="${times[i]}" | โทนสี="${palettes[i]}" | อารมณ์="${emotions[i]}"`);
    }
    body +=
      `สร้าง ${count} ชุด ${sameOrNew} ${noOutfit ? 'เปลี่ยนแค่ท่าทาง/มุมกล้อง/ฉาก (ห้ามเปลี่ยนเสื้อผ้า)' : 'เปลี่ยนฉาก/เสื้อผ้า/ท่าทาง/มุมกล้องให้หลากหลาย'}\n` +
      `ใช้ "ใบสั่งผสม" ด้านล่างร้อยเรียงลง image_prompt อย่างสมูท:\n` + perSet.join('\n') + '\n';
  }

  let aiOverlayNote = '';
  if (aiOverlay && overlayAnchor) {
    const used = (usedOverlays || []).filter(Boolean);
    aiOverlayNote =
      `\n📝 ข้อความบนภาพ (overlay_text) — ระบบ "คำหลักล็อก + AI แต่งต่อ":\n` +
      `- ⛔ ทุกชุด "ต้องมีคำหลัก: ${overlayAnchor}" เสมอ และวางเป็น "คำแรก/คำเด่น" (ระบบจะเรนเดอร์ ${overlayAnchor} ให้ตัวใหญ่กว่าคำอื่น)\n` +
      `- รูปแบบ: "${overlayAnchor} + วลีสั้นๆ คมๆ" ที่ AI คิดเองให้เข้าธีม "${overlayHint}" (สื่ออารมณ์/ขายของ/เล่นคำได้)\n` +
      `- 🎯 ทุกชุดต้อง "ไม่ซ้ำกันเลย" คิดวลีต่อท้ายใหม่ทุกชุด (มุมมอง/อารมณ์/การเล่นคำต่างกัน) ≤ 6 คำ สะกดไทยถูก ห้ามขึ้นต้น "สวัสดี"\n` +
      (used.length ? `- ❌ ห้ามซ้ำ/คล้ายของที่ใช้ไปแล้ว: ${used.map(u => `"${u}"`).join(', ')}\n` : '') +
      `- ใส่ field "overlay_text" ทุกชุด เช่น "${overlayAnchor} ..." (แต่ละชุดต่างกันจริง)\n`;
  } else if (aiOverlay) {
    aiOverlayNote =
      `\n📝 ข้อความบนภาพ (overlay_text): คิดแคปชันไทยสั้นๆ สวยๆ น่าสนใจ เข้ากับคาแรกเตอร์/ฉากของแต่ละชุด (≤ 8 คำ สะกดถูก ห้ามขึ้นต้น "สวัสดี") ใส่ field "overlay_text" ในทุกชุด — แต่ละชุดต่างกัน ให้เข้ากับภาพ\n`;
  }
  const usedLines = (opts.usedLines || []).filter(Boolean);
  const usedNote = usedLines.length ? `\n🔁 ชุดก่อนๆ เปิดบทพูดแบบนี้ไปแล้ว ❌ ห้ามขึ้นต้น/มุมเล่าซ้ำ: ${usedLines.map(u => `"${u}"`).join(', ')}\n` : '';
  body += note16s + aiOverlayNote + usedNote + `\nรูปแบบ JSON: ${jsonFmt}\nต้องมี sets เท่ากับ ${count} พอดี`;
  return body;
}

function parseSets(content) {
  // ทนทาน: กู้ชุดที่ปิดครบแม้ output ถูกตัดกลางคัน + ซ่อม newline ดิบในสตริง
  const sets = salvageSets(content, { arrayKeys: ['sets', 'data', 'results'] });
  if (!sets.length) throw new Error('อ่านผลลัพธ์จาก AI ไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง)');
  return sets.map(s => ({
    image_prompt: String(s.image_prompt || s.image || s.imagePrompt || '').trim(),
    video_prompt: String(s.video_prompt || s.video || s.script || '').trim(),
    video_prompt_2: String(s.video_prompt_2 || s.video2 || s.script2 || '').trim(),
    overlay_text: String(s.overlay_text || s.overlay || s.caption || '').trim()
  })).filter(s => s.image_prompt || s.video_prompt);
}

function applyPostProcess(sets, opts = {}) {
  const seconds = opts.seconds || 8;
  const aiOverlay = !!opts.aiOverlay;
  const globalOverlay = (opts.overlayText || '').trim();
  const overlayAnchor = aiOverlay && globalOverlay ? globalOverlay.split(/\s+/)[0] : '';
  // คำสั่งล็อกหน้า/ชุดอยู่ใน lib/meta-prompts.js (ใส่ตอนส่งให้ Meta AI พร้อมรูป) — ที่นี่แค่เลือกบูสเตอร์ที่ไม่ขัดกับรูปหน้า
  const male = opts.gender === 'male';
  // opts.who = หน้าตา/แต่งหน้า/ผม/สีผิว แบบอินฟลูไทย (thai-look.js) — มีแล้วไม่ต้องมีบูสเตอร์ซ้ำ
  const who = deAI(opts.who || '');
  const beauty = faceLockOf(opts) === 'photo' ? (male ? BEAUTY_REF_MALE : BEAUTY_REF_FEMALE)
    : who ? '' : (male ? BEAUTY_MALE : BEAUTY_FEMALE);

  return sets.map(s => {
    let img = deAI(s.image_prompt); // ตัดคำที่ทำให้ภาพดูเป็น AI (cinematic, flawless ...) ออกจากฉากที่ AI เขียน
    // หน้าตาขึ้นก่อน แทน subject สั้นๆ ที่ AI เขียน ("a Thai woman, ...")
    if (who) img = `${who}; ${img.replace(/^(?:an?\s+)?(?:young\s+)?thai\s+(?:woman|man|girl|guy|lady)\b[\s,;:.-]*/i, '')}`;

    // ข้อความบนภาพ: โหมด AI = แคปชันต่อชุด (overlay_text) · โหมดพิมพ์เอง = ข้อความเดียวทุกชุด
    let rawOverlay = aiOverlay ? String(s.overlay_text || '').trim() : globalOverlay;
    // กันพลาด: ถ้า AI ลืมใส่คำหลัก → เติมคำหลักนำหน้าให้เสมอ
    if (aiOverlay && overlayAnchor && rawOverlay && !rawOverlay.includes(overlayAnchor)) {
      rawOverlay = `${overlayAnchor} ${rawOverlay}`.trim();
    }
    const overlayLines = rawOverlay ? rawOverlay.split('\n').map(t => t.trim()).filter(Boolean) : [];
    if (overlayLines.length) {
      const joined = overlayLines.join('\\n');
      const style = pick(KB.OVERLAY_STYLES);
      const emphasis = overlayAnchor
        ? ` Make "${overlayAnchor}" the HERO word — ~2-3x larger and bolder than the rest, other words smaller in a tidy hierarchy.`
        : '';
      img = `${img} Thai caption on the image, one line each: "${joined}".${emphasis} ${style} Correct, readable Thai spelling.`;
    }

    const avoid = overlayLines.length ? AVOID_TEXT : AVOID;
    img = img.trim().replace(/[\s,;:]+$/, '');
    if (img && !/[.!?"]$/.test(img)) img += '.'; // ฉากที่ AI เขียนมักไม่มีจุดท้าย — กันประโยคถัดไปติดกัน
    img = [img + (opts.forVideo ? ' ' + FRAME_TALK : ''), beauty, phoneLook(opts.gender, opts.age), avoid].filter(Boolean).join(' ');

    const fit1 = LEN.fitToSeconds(s.video_prompt || '', seconds);
    const out = { image_prompt: img.trim(), video_prompt: wrapVideo(fit1.text, seconds, opts.gender).trim(), video_seconds: fit1.seconds, video_trimmed: fit1.trimmed, overlay: rawOverlay || '' };
    if (s.video_prompt_2) {
      const fit2 = LEN.fitToSeconds(s.video_prompt_2, seconds);
      out.video_prompt_2 = wrapVideo(fit2.text, seconds, opts.gender, true).trim();
      out.video_seconds_2 = fit2.seconds;
      out.video_trimmed_2 = fit2.trimmed;
    }
    return out;
  });
}

export { BEAUTY_FEMALE, BEAUTY_MALE, NEGATIVE, NEGATIVE_TEXT, planScenes, buildSystemPrompt, buildUserPrompt, parseSets, applyPostProcess };
