'use strict';
/* ============================================================
 *  product-scene-knowledge.js — คลังฉากสินค้า (warehouse/hands/holding/tabletop)
 *  ข้อมูล (SCENE_LIB/POOL_LABELS) ย้ายไป "สมอง" บนเซิร์ฟเวอร์
 *  ไฟล์นี้เก็บแค่ logic (sceneComboCount) + re-export container จาก brain.js
 * ============================================================ */
import { SCENE_LIB, POOL_LABELS } from './brain.js';

function sceneComboCount(styleKey) {
  const lib = SCENE_LIB[styleKey];
  if (!lib) return 0;
  return Object.values(lib).reduce((acc, arr) => acc * Math.max(1, arr.length), 1);
}

export { SCENE_LIB, POOL_LABELS, sceneComboCount };
