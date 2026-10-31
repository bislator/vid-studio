'use strict';
/* ============================================================
 *  store.js — เก็บค่าตั้งค่าใน chrome.storage.local
 *  (แทนที่ config.json ของเวอร์ชัน Electron)
 * ============================================================ */

export function get(keys) {
  return chrome.storage.local.get(keys);
}
export async function set(obj) {
  await chrome.storage.local.set(obj);
  return true;
}
export async function getValue(key, fallback) {
  const o = await get(key);
  return (o && o[key] != null) ? o[key] : fallback;
}
