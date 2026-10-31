'use strict';
/* ============================================================
 *  license.js — VS-YYYYMMDD-XXXXXX unlock code, expiry date, checked locally (no server).
 *  Format: date + 6-char checksum → date cannot be edited alone.
 *  - Generate codes with tools/keygen.mjs (repo root) — default expiry = 1 month.
 *  - Clock rollback guard: if time goes backwards > 1 day from the last seen time = lock.
 *  - This is only a casual lock: SECRET is in this file — anyone who reads the source
 *    can generate their own codes. Rotate SECRET before publishing if that matters.
 * ============================================================ */
import * as store from './promptgen/store.js';

const SECRET = 'VHDRBUGWNNQJLN358YL5'; // must match tools/keygen.mjs
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DAY = 24 * 60 * 60 * 1000;

const normalize = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '');

async function checksum(ymd) {
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SECRET}|${ymd}`)));
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[buf[i] % 32];
  return out;
}

// code → expiry (end of that day, local time) or null if invalid
async function expiryOf(code) {
  const m = /^VS(\d{4})(\d{2})(\d{2})([A-Z0-9]{6})$/.exec(normalize(code));
  if (!m) return null;
  const [, y, mo, d, sum] = m;
  const end = new Date(+y, +mo - 1, +d, 23, 59, 59, 999);
  if (end.getMonth() !== +mo - 1 || end.getDate() !== +d) return null; // e.g. Feb 31
  return sum === (await checksum(`${y}${mo}${d}`)) ? end.getTime() : null;
}

// clock rollback guard — remember the latest time ever seen (never decreases)
async function clockOk(now) {
  const last = Number(await store.getValue('lastSeenAt', 0)) || 0;
  if (now < last - DAY) return false;
  if (now > last + 60 * 60 * 1000) await store.set({ lastSeenAt: now });
  return true;
}

/** { ok, reason: 'none' | 'expired' | 'clock', expires } */
export async function status() {
  const expires = await expiryOf(await store.getValue('unlockCode', ''));
  if (!expires) return { ok: false, reason: 'none' };
  const now = Date.now();
  if (!(await clockOk(now))) return { ok: false, reason: 'clock', expires };
  if (now > expires) return { ok: false, reason: 'expired', expires };
  return { ok: true, expires };
}

export async function isActivated() {
  return (await status()).ok;
}

export async function activate(code) {
  if (!normalize(code)) return { ok: false, error: 'Please enter an unlock code' };
  const expires = await expiryOf(code);
  if (!expires) return { ok: false, error: 'Invalid code' };
  const now = Date.now();
  if (!(await clockOk(now))) return { ok: false, error: 'Device clock is wrong — set it correctly first' };
  if (now > expires) return { ok: false, error: 'This code has expired — request a new one' };
  await store.set({ unlockCode: normalize(code) });
  return { ok: true, expires };
}
