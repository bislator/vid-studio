#!/usr/bin/env node
// verify-license.mjs — sanity-check the license module of the packaged extension.
// Mocks chrome.storage, imports the real lib/license.js from the given extension
// directory, activates a freshly generated code, and asserts status().ok === true.
// Usage: node tools/verify-license.mjs <extension-dir>
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node tools/verify-license.mjs <extension-dir>'); process.exit(1); }

const SECRET = 'VHDRBUGWNNQJLN358YL5'; // keep in sync with tools/keygen.mjs
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const expiry = new Date();
expiry.setMonth(expiry.getMonth() + 1);
const pad = (n) => String(n).padStart(2, '0');
const ymd = `${expiry.getFullYear()}${pad(expiry.getMonth() + 1)}${pad(expiry.getDate())}`;
const buf = createHash('sha256').update(`${SECRET}|${ymd}`).digest();
let sum = '';
for (let i = 0; i < 6; i++) sum += ALPHABET[buf[i] % 32];
const code = `VS-${ymd}-${sum}`;

const mem = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => (mem[k] !== undefined ? { [k]: mem[k] } : {}),
  set: async (o) => { Object.assign(mem, o); return true; },
}}};

const license = await import(pathToFileURL(resolve(dir, 'lib/license.js')).href);
const bad = await license.activate('VS-19700101-WRONGX');
const act = await license.activate(code);
const st = await license.status();

if (bad.ok !== false) { console.error('FAIL: bogus code was accepted'); process.exit(1); }
if (!act.ok) { console.error(`FAIL: activate(${code}) → ${JSON.stringify(act)}`); process.exit(1); }
if (!st.ok) { console.error(`FAIL: status → ${JSON.stringify(st)}`); process.exit(1); }

console.log(`OK: ${code} accepted, expires ${new Date(st.expires).toISOString()}`);
