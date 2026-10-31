#!/usr/bin/env node
// keygen.mjs — generate Vid Studio unlock codes: VS-YYYYMMDD-XXXXXX
// Usage: node tools/keygen.mjs [YYYY-MM-DD]   (default: today + 1 month)
// The SECRET must match extension/lib/license.js.
import { createHash } from 'node:crypto';

const SECRET = 'VHDRBUGWNNQJLN358YL5';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const arg = process.argv[2];
let y, mo, d;
if (arg) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(arg);
  if (!m) { console.error('Usage: node tools/keygen.mjs [YYYY-MM-DD]'); process.exit(1); }
  [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (new Date(y, mo - 1, d).getMonth() !== mo - 1) { console.error('Invalid date'); process.exit(1); }
} else {
  const t = new Date(); t.setMonth(t.getMonth() + 1);
  [y, mo, d] = [t.getFullYear(), t.getMonth() + 1, t.getDate()];
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = `${y}${pad(mo)}${pad(d)}`;

const buf = createHash('sha256').update(`${SECRET}|${ymd}`).digest();
let sum = '';
for (let i = 0; i < 6; i++) sum += ALPHABET[buf[i] % 32];

console.log(`VS-${ymd}-${sum}`);
