// localStorage under one key. Every access is guarded: private windows and blocked
// storage throw, and the game must still work (it just won't remember anything).

const KEY = 'mathle:v1';

function empty() {
  return { days: {}, notes: {} };
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || typeof data !== 'object') return empty();
    return {
      days: data.days && typeof data.days === 'object' ? data.days : {},
      notes: data.notes && typeof data.notes === 'object' ? data.notes : {},
    };
  } catch {
    return empty();
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable or full; nothing useful to do.
  }
}

export function getNotes(day) {
  return load().notes[day] ?? '';
}

export function setNotes(day, text) {
  const data = load();
  if (text) data.notes[day] = text;
  else delete data.notes[day];
  save(data);
}

// A finished day: { puzzleId, expr, value, score }. Its presence locks the day.
export function getDay(day) {
  const entry = load().days[day];
  return entry && typeof entry.expr === 'string' ? entry : null;
}

export function saveDay(day, entry) {
  const data = load();
  data.days[day] = entry;
  save(data);
}

export function clearDay(day) {
  const data = load();
  delete data.days[day];
  save(data);
}
