// Which puzzle is today's, plus a seeded shuffle so the tray order is the same all day.

// Day 0. Day index = days since this date, mod the puzzle count.
export const LAUNCH_DATE = '2026-10-18';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;

// Local calendar date as "YYYY-MM-DD" (the player's day, not UTC's).
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDateKey(s) {
  return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(utcMs(s));
}

// Whole days from LAUNCH_DATE to `key`. Uses UTC midnights so DST never shifts it.
export function daysSinceLaunch(key) {
  return Math.round((utcMs(key) - utcMs(LAUNCH_DATE)) / MS_PER_DAY);
}

// Index into the puzzle list; wraps in both directions.
export function puzzleIndex(key, count) {
  const n = daysSinceLaunch(key);
  return ((n % count) + count) % count;
}

function utcMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// FNV-1a: a small, stable string hash for seeding.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: a seeded random generator returning floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates with a seeded generator. Returns a new array.
export function shuffle(items, seed) {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
