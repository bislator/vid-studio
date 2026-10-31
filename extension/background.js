// Vid Studio — background service worker.
// Clicking the toolbar icon opens the side panel; the engine ticks every 30 s (and whenever the panel asks).
import { tick, handle } from "./lib/engine.js";

function setup() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  tick();
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

chrome.alarms.get("tick").then((a) => a || chrome.alarms.create("tick", { periodInMinutes: 0.5 }));
chrome.alarms.onAlarm.addListener((a) => a.name === "tick" && tick());

// A finished (or failed) download is what the engine waits for after a clip is generated.
chrome.downloads.onChanged.addListener((d) => d.state && tick());

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  handle(msg).then((result) => reply({ ok: true, result }), (e) => reply({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
