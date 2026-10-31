// Scene building blocks for first-person "a hand holds the product" review clips (no AI).
// Many students use this at once, so every part is a large pool and a scene is one pick from each:
// place × light × camera × hand (skin × nails × sleeve × accessory) × two motions — billions of combinations.
// A scene's key is remembered so the same scene is never generated twice in this browser, and within one batch the
// places, lights, cameras and hands are cycled so neighbouring clips never look alike.

export const PLACES = [
  "a light-wood kitchen table by a window", "a home kitchen counter with a rice cooker and everyday items", "a cozy café table with a latte, warm interior blurred behind",
  "a white marble café table", "an office desk with a keyboard and a notebook", "a study desk with a laptop and pastel stationery",
  "a bedroom vanity with a round mirror and skincare bottles", "a bathroom counter in front of a mirror", "a bed with soft white linen and pillows",
  "a sofa with a chunky knit blanket", "a living-room coffee table with a small plant", "a balcony railing with a city view",
  "a condo balcony with potted plants", "a car interior, dashboard softly visible", "the passenger seat of a car with sunlight through the window",
  "a motorbike seat parked in a quiet Thai soi", "a convenience-store shelf, softly blurred", "a fresh-market stall with colourful produce blurred behind",
  "a street-food cart at night with warm lights", "a night market with string lights", "a park bench under big trees",
  "a picnic mat on green grass", "a beach towel on white sand", "a poolside sun lounger",
  "a gym bench with dumbbells nearby", "a yoga mat in a bright room", "a laundry corner beside a washing machine",
  "a garden table with flowers", "a hotel bed with crisp white sheets", "an airport lounge seat by a big window",
  "a city train window with the skyline passing", "a coworking-space desk", "a school desk with notebooks",
  "a bookshelf full of books", "a window sill with succulents", "a textured grey concrete wall",
  "a pastel wall with a small neon sign", "a small boutique shop counter", "a beauty-salon counter",
  "a dining table with home-cooked Thai dishes blurred behind", "a camping table outdoors with a lantern", "a window with raindrops on the glass",
  "a street at night with colourful neon signs", "a rooftop ledge at dusk", "an office pantry counter with a coffee machine",
  "a kids' playroom with soft toys blurred behind", "a pet corner with a cat bed blurred behind", "a home office with a monitor and desk lamp",
];

export const LIGHTS = [
  "soft morning window light", "warm lamp light", "overcast natural daylight", "golden-hour sunlight", "bright midday sun with crisp shadows",
  "soft open shade outdoors", "colourful night neon light", "warm café pendant lights", "cool white office light", "gentle sunset backlight",
];

export const CAMERAS = [
  "close-up at chest height", "slightly top-down angle", "eye-level close-up", "45-degree angle", "slightly low angle",
  "close-up with shallow depth of field", "medium close-up showing a bit of the setting", "over-the-wrist point of view",
];

// Hands: built from parts so two students rarely get the same hand.
export const SKINS = ["fair", "light-tan", "golden-tan", "medium-brown"];
const NAILS = {
  female: ["long nude almond-shaped nails", "glossy red nails", "a clean French manicure", "short natural nails", "pastel pink gel nails",
    "milky white gel nails", "short coral nails", "nude nails with fine glitter", "silver-tipped nails", "dark burgundy nails"],
  male: ["short clean nails", "neatly trimmed nails", "short nails and visible knuckles", "slightly rough working hands"],
};
const SLEEVES = {
  female: ["a black knit sleeve", "a beige sweater sleeve", "a white shirt cuff", "a denim jacket sleeve", "a pastel cardigan sleeve", "a bare wrist",
    "an oversized hoodie sleeve", "a striped shirt sleeve", "a satin blouse sleeve", "a sports-jacket sleeve", "a linen shirt sleeve", "a cropped tee, bare arm"],
  male: ["a dark hoodie sleeve", "a white shirt cuff", "a denim jacket sleeve", "a bare wrist", "a navy blazer cuff", "a grey sweatshirt sleeve",
    "a flannel shirt sleeve", "a sports-jacket sleeve", "a black tee, bare arm", "a work-shirt sleeve"],
};
const ACCESSORIES = {
  female: ["", "", "a thin gold bracelet", "a silver ring", "a smartwatch", "a beaded bracelet", "a red string bracelet", "a hair tie on the wrist"],
  male: ["", "", "a silver wristwatch", "a leather-strap watch", "a smartwatch", "a red string bracelet"],
};

// Every motion keeps the front label facing the camera: big rotations make the video model redraw the label.
export const ACTIONS = [
  "slowly tilts the product only a few degrees left and right, front label always facing the camera",
  "slowly brings the product a little closer to the camera, then back, front always facing the camera",
  "moves in a small slow arc while the product front keeps facing the camera",
  "lightly taps a finger beside the label without covering it, product held steady",
  "holds the product steady while the camera slowly drifts slightly closer",
  "lifts the product a little into the light, front still facing the camera",
  "turns the wrist very slightly so light glints on the product, label still readable",
  "holds the product still for a beat, then gives it a tiny presenting nudge toward the camera",
];

// Minimal headline looks (white handwriting + one small doodle), picked at random per clip.
const HEADLINE_STYLES = [
  "white handwritten brush script with a tiny sparkle doodle", "white handwritten marker text with a small heart outline",
  "white handwritten text with a small underline swoosh", "white handwritten script with two tiny star doodles",
  "white felt-tip handwriting with tiny dot doodles", "clean white handwritten text with a small arrow pointing at the product",
];

// Headlines when the user types none: short Thai hooks (no TikTok-banned claims), some with the product name.
const HOOKS = [
  "ของมันต้องมี", "ใช้แล้วติดใจ", "บอกต่อด่วน", "คุ้มเกินราคา", "ตัวท็อปประจำบ้าน", "ใช้ทุกวันไม่มีเบื่อ", "ปักตะกร้าแล้ว", "ของดีบอกต่อ",
  "รีวิวจริง ใช้จริง", "ไอเท็มลับของฉัน", "ถูกและดีมีอยู่จริง", "ซื้อซ้ำแล้ว", "ตัวนี้ห้ามพลาด", "ใครยังไม่มี ต้องมีแล้ว", "เล็กๆ แต่ใช้ดีมาก",
  "พกง่าย ใช้สะดวก", "ติดบ้านไว้ อุ่นใจ", "ดีจนต้องบอกต่อ", "ฟินทุกครั้งที่ใช้", "ไม่ลองไม่รู้", "แม่ค้าใช้เองจริง", "ของชิ้นนี้ดีจริง",
];
const HOOKS_NAMED = ["{n} ตัวนี้ดีจริง", "รีวิว {n}", "{n} ใช้ดีบอกต่อ", "{n} ของมันต้องมี", "เจอแล้ว {n} ที่ตามหา"];

const KEEP_IMAGE =
  "Keep the product 100% identical to the uploaded photo: same shape, proportions, colors, materials, logo, label " +
  "layout and every word of printed text letter for letter. Do not invent, rewrite, translate, blur or add any text " +
  "or details on the product. Show the same front side as in the uploaded photo, facing the camera.";

const KEEP_VIDEO =
  "The product must not change at all during the clip: identical label, text, logo, colors and shape in every frame " +
  "as in the first frame. Front side always facing the camera, never rotated more than a few degrees, no warping, " +
  "no morphing, no new objects.";

const rand = (n) => Math.floor(Math.random() * n);

function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Draws from a pool without repeats until it is used up, then reshuffles.
function cycler(n) {
  let bag = [];
  return () => {
    if (!bag.length) bag = shuffled(n);
    return bag.pop();
  };
}

const handGenders = (hands) => (hands === "female" || hands === "male" ? [hands] : ["female", "male"]);
const handCount = (g) => SKINS.length * NAILS[g].length * SLEEVES[g].length * ACCESSORIES[g].length;

export function handText(g, skin, nails, sleeve, acc) {
  const extra = ACCESSORIES[g][acc];
  return `a ${g === "male" ? "man" : "woman"}'s ${SKINS[skin]} hand with ${NAILS[g][nails]} and ${SLEEVES[g][sleeve]}${extra ? `, wearing ${extra}` : ""}`;
}

/** One random hand description (used by the AI "hands only" / warehouse styles too). */
export function randomHand(hands = "any") {
  const pool = handGenders(hands);
  const g = pool[rand(pool.length)];
  return handText(g, rand(SKINS.length), rand(NAILS[g].length), rand(SLEEVES[g].length), rand(ACCESSORIES[g].length));
}

export function sceneCount(hands = "any") {
  const handsN = handGenders(hands).reduce((n, g) => n + handCount(g), 0);
  return PLACES.length * LIGHTS.length * CAMERAS.length * handsN * ACTIONS.length * (ACTIONS.length - 1);
}

// key = "place-light-camera-g.skin.nails.sleeve.acc-a1-a2" (g = f | m)
export function parseKey(key) {
  const [place, light, camera, hand, a1, a2] = String(key).split("-");
  const [g, skin, nails, sleeve, acc] = hand.split(".");
  const gender = g === "m" ? "male" : "female";
  return {
    place: PLACES[+place], light: LIGHTS[+light], camera: CAMERAS[+camera], gender,
    hand: handText(gender, +skin, +nails, +sleeve, +acc), actions: [ACTIONS[+a1], ACTIONS[+a2]],
  };
}

// Pick `count` scene keys not in `used` (a Set). Places, lights, cameras, nails and sleeves are cycled so one batch looks
// varied. Adds the picked keys to `used`; when (astronomically unlikely) everything was used, repeats are allowed.
export function pickScenes(count, used, hands = "any") {
  const genders = handGenders(hands);
  const next = { place: cycler(PLACES.length), light: cycler(LIGHTS.length), camera: cycler(CAMERAS.length), skin: cycler(SKINS.length) };
  const per = Object.fromEntries(genders.map((g) => [g, { nails: cycler(NAILS[g].length), sleeve: cycler(SLEEVES[g].length) }]));
  const keys = [];
  for (let i = 0; i < count; i++) {
    let key;
    for (let tries = 0; tries < 50; tries++) {
      const g = genders[i % genders.length];
      const a1 = rand(ACTIONS.length);
      const a2 = (a1 + 1 + rand(ACTIONS.length - 1)) % ACTIONS.length;
      const hand = [g === "male" ? "m" : "f", next.skin(), per[g].nails(), per[g].sleeve(), rand(ACCESSORIES[g].length)].join(".");
      key = [next.place(), next.light(), next.camera(), hand, a1, a2].join("-");
      if (!used.has(key)) break;
    }
    used.add(key);
    keys.push(key);
  }
  return keys;
}

/** Headlines for a batch: the user's lines in turn, or shuffled Thai hooks (no repeats until all are used). */
export function pickHeadlines(count, lines = [], name = "") {
  const own = lines.map((l) => String(l).trim()).filter(Boolean);
  if (own.length) return Array.from({ length: count }, (_, i) => own[i % own.length]);
  const n = String(name || "").trim();
  const pool = HOOKS.concat(n && n.length <= 16 ? HOOKS_NAMED.map((h) => h.replace("{n}", n)) : []);
  const next = cycler(pool.length);
  return Array.from({ length: count }, () => pool[next()]);
}

// Prompts for one scene. `name` = product name (any language), `extra` = optional extra direction,
// `headline` = optional minimal Thai headline drawn on the image.
export function buildPrompts(key, name = "", extra = "", headline = "") {
  const s = parseKey(key);
  const product = name.trim() ? `the product (${name.trim()})` : "the product";
  const more = extra.trim() ? ` Additional direction: ${extra.trim()}` : "";
  const text = headline.trim()
    ? `Minimal headline at the top-left: "${headline.trim()}" in ${HEADLINE_STYLES[rand(HEADLINE_STYLES.length)]}, big enough to read on a phone (about 1/12 of the image height), with a soft shadow so it stands out; not covering the product or the hand, correct Thai spelling. No other text, no watermark.`
    : "No text overlay, no watermark.";
  return {
    label: headline.trim() || `${s.place} · ${s.light}`,
    headline: headline.trim(),
    imagePrompt:
      `Vertical 9:16 first-person phone-camera shot, handheld, ${s.light}, ${s.camera}, natural and slightly imperfect. ` +
      `In frame: ${s.hand}. The hand holds ${product}, exactly as in the uploaded photo, its front facing the camera. ` +
      `The product fills 50-70% of the frame and is perfectly sharp. Background: ${s.place}, soft but recognizable. ` +
      `No face, only the hand. ${text} Fingers do not cover the main design. ${KEEP_IMAGE}${more}`,
    videoPrompt:
      `Handheld 10-second continuous take, first-person. The hand ${s.actions[0]}. Then the hand ${s.actions[1]}. ` +
      `Slow, gentle motion only, no fast moves. ${KEEP_VIDEO}${headline.trim() ? " The headline text may fade out; no other new text." : " No new text."}`,
  };
}
