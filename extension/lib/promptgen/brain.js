'use strict';
/* ============================================================
 *  brain.js — "สมอง" (คลังพรอมต์ทั้งหมด) ของ Vid Studio
 *  ------------------------------------------------------------
 *  ฉบับ Vid Studio: ใช้ข้อมูลในเครื่อง (brain-fallback.js) อย่างเดียว
 *  ไม่ต้องมี License และไม่ดึงจาก afforrai.com
 *  ชื่อ container เหมือนต้นฉบับ เพื่อให้โมดูลอื่นที่คัดลอกมา import ได้โดยไม่ต้องแก้
 * ============================================================ */
import { FALLBACK } from './brain-fallback.js';

/* ---- container (อ้างอิงคงที่ — โมดูล data import พวกนี้) ---- */
export const GENRES = {}, HOOKS = {}, WARDROBE = {}, GENERIC = {}, THEMES = {};
export const SCENE_LIB = {}, POOL_LABELS = {}, FEMALE = {}, MALE = {}, FACE_VARIETY = {};
export const BEATS = [], COSTUME_COLORS = [], CATEGORIES = [];
export const POSES = [], LOCATIONS = [], CAMERA_ANGLES = [], TIMES = [], PALETTES = [], EMOTIONS = [], OVERLAY_STYLES = [];

const fillObj = (target, src) => Object.assign(target, src || {});
const fillArr = (target, src) => { if (Array.isArray(src)) target.push(...src); };

const b = FALLBACK;
const s = b.series || {}, p = b.persona || {}, pr = b.product || {}, ps = b.productScene || {}, l = b.library || {};
fillObj(GENRES, s.GENRES); fillObj(HOOKS, s.HOOKS); fillObj(WARDROBE, s.WARDROBE);
fillArr(BEATS, s.BEATS); fillArr(COSTUME_COLORS, s.COSTUME_COLORS);
fillObj(THEMES, p.THEMES);
fillArr(POSES, p.POSES); fillArr(LOCATIONS, p.LOCATIONS); fillArr(CAMERA_ANGLES, p.CAMERA_ANGLES);
fillArr(TIMES, p.TIMES); fillArr(PALETTES, p.PALETTES); fillArr(EMOTIONS, p.EMOTIONS); fillArr(OVERLAY_STYLES, p.OVERLAY_STYLES);
fillArr(CATEGORIES, pr.CATEGORIES); fillObj(GENERIC, pr.GENERIC);
fillObj(SCENE_LIB, ps.SCENE_LIB); fillObj(POOL_LABELS, ps.POOL_LABELS);
fillObj(FEMALE, l.FEMALE); fillObj(MALE, l.MALE); fillObj(FACE_VARIETY, l.FACE_VARIETY);

// คำค้นที่คลังเดิมยังไม่มี
const homeCleaning = CATEGORIES.find((c) => c.key === 'home_cleaning');
if (homeCleaning) homeCleaning.keywords = [...(homeCleaning.keywords || []), 'ถุงขยะ', 'ขยะ', 'garbage bag', 'trash bag'];
