// Turns a prompt set (from promptgen's engines or the quick scene templates) into the chat messages sent to Meta AI.
// The engines write only the scene; the fixed lock / booster text is added here and in the engines' post-process —
// it costs no DeepSeek tokens.
// All face / outfit / product lock wording lives here, so the prompt engines only write the scene.
//
// Attachment roles, in the order the photos are attached:
//   product — the real product           face   — lock the face            outfit — lock the outfit
//   look    — one photo: face + hair + outfit
//   prev-face / prev-outfit / prev-look — an image this batch already generated, attached to keep later sets the same

const FACE_ROLES = ["face", "look", "prev-face", "prev-look"];
const OUTFIT_ROLES = ["outfit", "look", "prev-outfit", "prev-look"];
export const PERSON_ROLES = ["face", "outfit", "look", "prev-face", "prev-outfit", "prev-look"];

// Kept short on purpose: Meta AI condenses long requests and drops details, so each line says only what to take.
const REF = {
  product: (n) => `Photo ${n} = PRODUCT: copy it exactly — shape, colours, label and text unchanged.`,
  face: (n) => `Photo ${n} = FACE: the same person — identical face, skin tone and age, same hair colour; take only the face and hair.`,
  outfit: (n) => `Photo ${n} = OUTFIT: wear exactly this outfit — same cut, colours, pattern and accessories; take only the clothes, not the wearer's face.`,
  look: (n) => `Photo ${n} = CHARACTER: the same person — identical face and hair — in exactly the same outfit.`,
  "prev-face": (n) => `Photo ${n} = this person in an earlier picture: keep the identical face and hair; ignore its clothes and background.`,
  "prev-outfit": (n) => `Photo ${n} = an earlier picture: keep exactly the same outfit; ignore its face and background.`,
  "prev-look": (n) => `Photo ${n} = this person in an earlier picture: keep the identical face, hair and outfit; ignore its background.`,
};

// Short Thai names for the side panel (which photo is which).
export const ROLE_TH = {
  product: "สินค้า", face: "หน้า", outfit: "ชุด", look: "หน้า+ผม+ชุด",
  "prev-face": "หน้าจากภาพชุดแรก", "prev-outfit": "ชุดจากภาพชุดแรก", "prev-look": "หน้า+ชุดจากภาพชุดแรก",
};

// The reference part of an image message (everything before the scene description); "" without photos.
export function lockText(roles = []) {
  if (!roles.length) return "";
  const refs = roles.map((r, i) => (REF[r] || ((n) => `Photo ${n} = reference.`))(i + 1));
  const face = roles.some((r) => FACE_ROLES.includes(r));
  const outfit = roles.some((r) => OUTFIT_ROLES.includes(r));
  const wins = face && outfit ? "face and outfit" : face ? "face" : outfit ? "outfit" : "";
  const rules = ["One new photo, not an edit or collage."];
  if (wins) rules.push(`For the ${wins}, the photos win over the text.`);
  const head = roles.length > 1 ? "Create an image using the attached photos as references." : "Create an image using the attached photo as a reference.";
  return [head, ...refs, ...rules].join(" ");
}

export function imageMessage(imagePrompt, roles = [], quick = false) {
  const prompt = String(imagePrompt || "").trim();
  if (!roles.length) return `Create an image: ${prompt}`;
  if (quick) {
    return "Create an image using the attached product photo, copying the product exactly as it is (same label, text and details): " + prompt;
  }
  return `${lockText(roles)} Description: ${prompt}`;
}

// Used only when a set has no video prompt (library mode): natural movement, no dialogue.
const MOTIONS = [
  "{s} smiles softly at the camera, then slowly tilts {p} head and tucks a strand of hair behind {p} ear",
  "{s} looks away for a moment, then turns back to the camera with a warm, confident smile",
  "{s} laughs gently, shifts {p} weight and adjusts {p} outfit, the camera stays still",
  "{s} takes a slow breath, blinks naturally and gives a small playful wave to the camera",
  "a light breeze moves {p} hair while {s} looks into the camera and smiles, steady camera",
];

// opts: { quick, gender, person: a person is in the image, product: a real product is in the image }
export function videoMessage(videoPrompt, part, opts = {}) {
  const prompt = String(videoPrompt || "").trim() || motion(opts.gender);
  if (opts.quick) return "Animate this image into a vertical 9:16 video, about 10 seconds, no text, no music. " + prompt;
  // Meta AI re-draws the face while the person talks; say plainly that frame 1 is the reference for every frame.
  let hold = "";
  if (opts.person) hold += " Keep the exact face, hair and outfit from the image in every frame — no morphing, no different person.";
  if (opts.product) hold += " Keep the product's label and text unchanged.";
  if (part === 2) {
    return "Now animate the same image again into a second vertical 9:16 video of about 10 seconds that continues seamlessly " +
      `from the previous clip (same person, same place, same outfit).${hold} ` + prompt;
  }
  return `Animate this image into a vertical 9:16 video of about 10 seconds.${hold} ` + prompt;
}

function motion(gender) {
  const male = gender === "male";
  const line = MOTIONS[Math.floor(Math.random() * MOTIONS.length)]
    .replace(/\{s\}/g, male ? "he" : "she").replace(/\{p\}/g, male ? "his" : "her");
  return `One continuous 10-second shot: ${line}. Natural, believable movement, same person every frame, no text on screen.`;
}

// The roles a batch's jobs attach: the user's photos, then (after the first image exists) the "same as first" one.
export function batchRoles(attachments = [], fromFirst = null, later = false) {
  const roles = attachments.map((a) => a.role);
  if (later && fromFirst) roles.push(`prev-${fromFirst}`);
  return roles;
}
