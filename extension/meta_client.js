// Meta AI page driver. Runs in the MAIN world of the user's own meta.ai tab and drives the chat UI
// exactly like a person would: new chat -> attach the job's photos (if any) -> ask for an image -> ask to animate it
// (once, twice for a two-part clip, or not at all for image-only jobs).
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Set per job by runScene; throws when the job was cancelled from the side panel.
  let guard = () => {};

  async function waitFor(fn, timeoutMs, what) {
    const start = Date.now();
    for (;;) {
      guard();
      const v = fn();
      if (v) return v;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
      await sleep(500);
    }
  }

  const editor = () => document.querySelector('[data-lexical-editor][contenteditable="true"]');
  const sendBtn = () => document.querySelector('button[aria-label="Send"]');
  const stopBtn = () => document.querySelector('button[aria-label="Stop"], button[aria-label="Stop generating"]');

  const newChatLink = () => [...document.querySelectorAll('a[href="/"]')].find((a) => /New chat|แชทใหม่/.test(a.innerText));
  // React tags a DOM node with __reactFiber$…/__reactProps$… once it is hydrated. Until then the link is a plain
  // <a href="/">: clicking it reloads the whole page, which wipes the running job.
  const hydrated = (el) => Object.keys(el).some((k) => k.startsWith("__react"));

  async function newChat() {
    if (!newChatLink()) throw new Error("New chat link not found — is this the meta.ai app page?");
    const link = await waitFor(() => (newChatLink() && hydrated(newChatLink()) ? newChatLink() : null), 60000,
      "meta.ai page to finish loading (keep the meta.ai tab visible on screen)");
    link.click();
    await waitFor(() => location.pathname === "/" && editor(), 20000, "new chat");
    await sleep(1500);
  }

  const composer = () => editor() && editor().closest("form, [class*='rounded']")?.parentElement;
  const composerImages = () => (composer() ? composer().querySelectorAll("img").length : 0);

  const editorText = () => (editor() ? editor().innerText.replace(/\s+/g, " ").trim() : "");

  // A cancelled job (or the user) can leave photos and half a prompt in the composer; the next job must start clean.
  // meta.ai only takes a photo out on its next animation frame, which Chrome skips while the tab is not on screen,
  // so wait for each removal to really happen.
  async function clearComposer() {
    for (let i = 0; i < 10 && composerImages(); i++) {
      const remove = composer().querySelector('button[aria-label^="Remove"]');
      if (!remove) break;
      const before = composerImages();
      remove.click();
      await waitFor(() => composerImages() < before, 5000, "old photo to be removed from the message box (keep the meta.ai tab visible on screen)");
    }
    if (!editorText()) return;
    const range = document.createRange();
    range.selectNodeContents(editor());
    editor().focus();
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    await sleep(200); // Lexical picks the selection up on selectionchange
    editor().dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true }));
    await sleep(300);
  }

  async function attach(blob, name) {
    const before = composerImages();
    const add = document.querySelector('button[aria-label="Add attachment"]');
    if (!add) throw new Error("Add attachment button not found");
    add.click();
    const input = await waitFor(() => document.querySelector('input[type="file"]'), 10000, "file input");
    const dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type: blob.type || "image/jpeg" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => composerImages() > before, 30000, "attachment preview");
    await sleep(3000); // let the upload finish
    closeDialogs();
  }

  // The "Add media" dialog traps focus; text typed while it is open never reaches the editor.
  function closeDialogs() {
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      const close = d.querySelector('button[aria-label="Close"], button[aria-label="ปิด"]');
      if (close) close.click();
    }
  }

  // Lexical ignores plain DOM edits; a synthetic paste is the reliable way in (execCommand as fallback).
  async function send(text) {
    closeDialogs();
    await sleep(300);
    const ed = editor();
    ed.focus();
    const probe = text.slice(0, 25);
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    try {
      await waitFor(() => editorText().includes(probe), 5000, "prompt in editor");
    } catch {
      guard();
      ed.focus();
      document.execCommand("insertText", false, text);
      await waitFor(() => editorText().includes(probe), 5000, "prompt in editor (fallback)");
    }
    const btn = await waitFor(() => (sendBtn() && !sendBtn().disabled ? sendBtn() : null), 60000, "Send button (upload may still be running)");
    btn.click();
    await waitFor(() => !editorText().includes(probe), 15000, "message to be sent");
  }

  // Generated media are served from fbcdn; ignore avatars/icons by size, and the user's own photos (the attachment
  // thumbnails, and the "before" side of Meta AI's before/after slider, which reuses the same picture).
  const images = () => {
    const mine = new Set([...document.querySelectorAll('button[aria-label^="Open "] img')].map(srcOf));
    return [...document.querySelectorAll("img")].filter((i) => /fbcdn\.net/.test(i.src) && !mine.has(srcOf(i)) && i.naturalWidth >= 900);
  };
  const videos = () => [...document.querySelectorAll("video")].filter((v) => /\.mp4/.test(v.currentSrc || v.src));
  const srcOf = (el) => el.currentSrc || el.src;

  // Meta AI sometimes keeps showing (or goes back to) the home page after a message is sent, while the chat runs on
  // in the history list (seen 2026-10-04: the image was made, the tab never showed it). Find the job's chat — the
  // one that was not in the list before sending — and open it so its image / video can be seen.
  const chatHrefs = () =>
    [...document.querySelectorAll('li[data-testid="conversation-item"] a[href^="/prompt/"]')].map((a) => a.getAttribute("href"));
  let chatPath = null; // "/prompt/<id>" of this job's chat, once known
  let chatsBefore = new Set();
  let lastOpen = 0;
  function keepOnChat(log) {
    const here = location.pathname;
    if (!chatPath) chatPath = here.startsWith("/prompt/") ? here : chatHrefs().find((h) => !chatsBefore.has(h)) || null;
    if (!chatPath || here === chatPath || Date.now() - lastOpen < 10000) return;
    const link = document.querySelector(`li[data-testid="conversation-item"] a[href="${chatPath}"]`);
    if (!link || !hydrated(link)) return; // a plain link would reload the page and wipe the job
    lastOpen = Date.now();
    log("opening the chat");
    link.click();
  }

  // kind: "image" | "video"; label is what progress messages call it ("image", "video", "video 2").
  async function waitNewMedia(kind, beforeSrcs, timeoutMs, log, label = kind) {
    const start = Date.now();
    for (;;) {
      guard();
      keepOnChat(log);
      const els = kind === "video" ? videos() : images();
      const fresh = els.filter((e) => !beforeSrcs.has(srcOf(e)));
      if (fresh.length && !stopBtn()) {
        await sleep(2000);
        return fresh[fresh.length - 1];
      }
      if (Date.now() - start > timeoutMs) {
        const last = [...document.querySelectorAll("main div")].map((d) => d.innerText).filter(Boolean).pop() || "";
        throw new Error(`Meta AI did not return a ${label} in ${Math.round(timeoutMs / 1000)}s (page ${location.pathname}). Last text: ${last.slice(-200)}`);
      }
      log(`${label}: waiting (${Math.round((Date.now() - start) / 1000)}s)`);
      await sleep(3000);
    }
  }

  // Delete one chat this extension created, through the history sidebar: "More options" → Delete (→ confirm).
  // Only ids the engine hands over are touched. Returns "deleted" | "missing" (not in the history list).
  const historyLink = (id) => document.querySelector(`li[data-testid="conversation-item"] a[href="/prompt/${id}"]`);
  async function deleteChat(id) {
    // Sidebar folded away: no history items at all → try again on a later job (the id stays on the list).
    if (!document.querySelector('li[data-testid="conversation-item"]')) throw new Error("history sidebar is closed");
    if (!historyLink(id)) return "missing";
    const more = historyLink(id).closest('li[data-testid="conversation-item"]').querySelector('button[aria-label="More options"]');
    if (!more) throw new Error("chat menu button not found");
    more.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }));
    const del = await waitFor(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
      .find((i) => /^(Delete|ลบ)$/.test(i.innerText.trim())), 5000, "chat menu");
    del.click();
    await sleep(800);
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    const confirm = dialog && [...dialog.querySelectorAll("button")].find((b) => /^(Delete|Delete chat|Delete conversation|ลบ|ลบแชท)$/i.test(b.innerText.trim()));
    if (confirm) confirm.click();
    await waitFor(() => !historyLink(id), 10000, "chat to leave the history");
    return "deleted";
  }

  // attachments: [{ blob, name }] in the order the image message describes them.
  // videoMessages: [] = image only, [part1] or [part1, part2].
  // deleteChatIds: older chats this extension made — removed first so the history keeps only the latest one.
  async function runScene({ attachments = [], imageMessage, videoMessages = [], deleteChatIds = [], onDeleted = () => {}, log = () => {}, aborted = () => false }) {
    guard = () => { if (aborted()) throw new Error("cancelled"); };
    for (const id of deleteChatIds) {
      log("deleting old chat");
      try {
        onDeleted(id, await deleteChat(id));
      } catch (e) {
        if (aborted()) throw e;
        log(`old chat not deleted: ${e.message || e}`); // never fails the job
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        closeDialogs();
      }
    }
    log("new chat");
    await newChat();
    await clearComposer();
    for (let i = 0; i < attachments.length; i++) {
      log(attachments.length > 1 ? `attaching photo ${i + 1}/${attachments.length}` : "attaching photo");
      await attach(attachments[i].blob, attachments[i].name);
    }
    // Never send a request with someone else's leftover photo in it.
    if (composerImages() !== attachments.length) {
      throw new Error(`message box has ${composerImages()} photos, expected ${attachments.length} (keep the meta.ai tab visible on screen)`);
    }
    const imgBefore = new Set(images().map(srcOf));
    chatPath = null;
    chatsBefore = new Set(chatHrefs());
    log("image: generating");
    await send(imageMessage);
    const img = await waitNewMedia("image", imgBefore, 7 * 60 * 1000, log);
    const videoUrls = [];
    for (let i = 0; i < videoMessages.length; i++) {
      const label = i ? `video ${i + 1}` : "video";
      const before = new Set(videos().map(srcOf));
      log(`${label}: generating`);
      await send(videoMessages[i]);
      videoUrls.push(srcOf(await waitNewMedia("video", before, 10 * 60 * 1000, log, label)));
    }
    return { imageUrl: srcOf(img), videoUrls, chatUrl: chatPath ? location.origin + chatPath : location.href };
  }

  window.MetaStudioClient = { runScene, currentChat: () => chatPath };
})();
