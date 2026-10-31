'use strict';
/* ============================================================
 *  llm.js — เรียก LLM (OpenAI-compatible) รวมศูนย์ ใช้ร่วมทั้ง generate.js และ pipeline.js
 *  - base_url ปรับได้จากหน้า "ตั้งค่า" (store: baseUrl) — ค่าเริ่มต้น = DeepSeek
 *    รองรับ endpoint อื่นที่เป็น OpenAI-compatible ได้ เช่น Ollama ในเครื่อง (http://IP:11434/v1)
 *  - response_format = json_object เสมอ
 *  - ปรับ temperature / max_tokens ต่อบทบาทได้ (ผู้กำกับเย็น, คนเขียนบทร้อน)
 *  - parse เป็น optional: ถ้าไม่ส่ง จะคืน content ดิบ
 * ============================================================ */
import * as store from './store.js';

const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_BASE  = 'https://api.deepseek.com';           // base_url เริ่มต้น (DeepSeek)
const API_URL       = DEFAULT_BASE + '/chat/completions';   // คงไว้เพื่อความเข้ากันได้ (โค้ดเก่าอ้าง)

// รวม base_url + '/chat/completions' (ตัด / ท้าย + ช่องว่าง) — base ต้องรวม /v1 เองถ้า endpoint ต้องการ
function endpointFrom(base) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  return (b || DEFAULT_BASE) + '/chat/completions';
}

async function callDeepSeek({ apiKey, model, system, user, parse, temperature = 1.0, maxTokens = 8000, baseUrl }) {
  const base = baseUrl || await store.getValue('baseUrl', DEFAULT_BASE);
  const res = await fetch(endpointFrom(base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature,
      max_tokens: maxTokens
    })
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = (j.error && j.error.message) ? j.error.message : msg; } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  return parse ? parse(content) : content;
}

export { DEFAULT_MODEL, DEFAULT_BASE, API_URL, endpointFrom, callDeepSeek };
